/**
 * lib/brand/quantize.ts — THE EXTRACTION ALGORITHM, as a pure function.
 *
 * WHY THIS IS SEPARATE FROM extract.client.ts: the phase brief requires the
 * extractor to "correctly handle" six specific awkward logo shapes, and to
 * state what the algorithm does in each. A canvas-bound extractor can only
 * be ASSERTED to handle them — nothing in a build container can run
 * getImageData(). Splitting the pixel maths out means all six cases are
 * unit-tested against synthetic pixel buffers in quantize.test.ts, and
 * extract.client.ts shrinks to a thin shell whose only job is turning an
 * image into an RGBA array. Same pattern as lib/quote/pricing.ts (pure,
 * tested) behind app/actions/quote.ts (I/O), and lib/entitlements/
 * decideEntitlement.ts behind check.ts.
 *
 * ============================ THE SIX CASES ============================
 * Each is proven by a named test in quantize.test.ts.
 *
 * 1. TRANSPARENT PNG — pixels with alpha < ALPHA_FLOOR are dropped before
 *    anything else. A logo that is 90% transparent ranks on its opaque 10%,
 *    and the transparent region contributes zero weight rather than
 *    registering as black (the naive failure, since RGBA 0,0,0,0 reads as
 *    pure black if alpha is ignored).
 *
 * 2. NEAR-WHITE BACKGROUND — a pixel that is both very light AND nearly
 *    unsaturated is classed as background, not brand. It is counted (so we
 *    can tell "logo on white card" from "genuinely white-branded") but
 *    excluded from candidacy. Without this, every logo on a white canvas
 *    extracts white as its primary.
 *
 * 3. NEAR-BLACK BACKGROUND — exactly symmetric to case 2. Handled by the
 *    same predicate with an inverted lightness bound, deliberately, so the
 *    two can never drift apart.
 *
 * 4. MONOCHROME LOGO — greys with no chroma anywhere. No chromatic bucket
 *    survives, so the algorithm does NOT invent a hue. It reports
 *    `monochrome`, returns the darkest non-background grey as primary, and
 *    leaves accent null for the caller to fill from the house token
 *    (lib/brand/tokens.ts substitutes the Phase 1 hazard). Inventing a
 *    colour here is the single worst thing this file could do: it would
 *    silently brand a contractor in a hue that appears nowhere in his logo.
 *
 * 5. SINGLE-COLOUR LOGO — exactly one chromatic bucket. primary is it;
 *    secondary and accent are returned null, again for tokens.ts to derive
 *    deterministically rather than being fabricated from noise here.
 *
 * 6. MOSTLY ONE COLOUR WITH A TINY ACCENT — the accent slot uses a
 *    DIFFERENT ranking function from primary/secondary: saturation weighted
 *    against count^ACCENT_COUNT_EXPONENT (sublinear). A small vivid mark can
 *    therefore outrank a large muted field for the accent slot specifically,
 *    while primary still goes to the dominant colour by raw weight. Ranking
 *    all three slots by weight alone is precisely why naive extractors miss
 *    the accent stripe in a logo that is 95% navy.
 * =======================================================================
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number; // 0-360
  s: number; // 0-1
  l: number; // 0-1
}

export type ExtractionCase =
  | 'chromatic' // two or more distinct chromatic buckets — the normal path
  | 'single_colour'
  | 'monochrome'
  | 'empty'; // nothing usable at all (fully transparent, or zero pixels)

export interface QuantizeResult {
  primaryHex: string | null;
  secondaryHex: string | null;
  accentHex: string | null;
  detectedCase: ExtractionCase;
  /** Human-readable trace, surfaced in the admin so a bad result is diagnosable. */
  notes: string[];
  /** Share of sampled pixels that were transparent / near-white / near-black. */
  stats: {
    sampled: number;
    transparent: number;
    nearWhite: number;
    nearBlack: number;
    neutral: number;
    chromatic: number;
  };
}

// --- thresholds, all named so the tests can reason about them ---------------

const ALPHA_FLOOR = 16; // 0-255. Below this a pixel is treated as absent.
const NEUTRAL_SAT = 0.12; // below this saturation, a pixel carries no usable hue
const NEAR_WHITE_L = 0.93;
const NEAR_BLACK_L = 0.07;
const HUE_SEPARATION = 25; // degrees; below this two buckets are "the same colour"
const ACCENT_COUNT_EXPONENT = 0.35; // sublinear — lets a small vivid mark win the accent slot
const MIN_BUCKET_SHARE = 0.005; // a bucket under 0.5% of chromatic pixels is noise

// --- colour space helpers (pure) -------------------------------------------

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;

  return { h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = ((h % 360) + 360) % 360 / 360;

  const channel = (t: number): number => {
    let tc = t;
    if (tc < 0) tc += 1;
    if (tc > 1) tc -= 1;
    if (tc < 1 / 6) return p + (q - p) * 6 * tc;
    if (tc < 1 / 2) return q;
    if (tc < 2 / 3) return p + (q - p) * (2 / 3 - tc) * 6;
    return p;
  };

  return {
    r: Math.round(channel(hk + 1 / 3) * 255),
    g: Math.round(channel(hk) * 255),
    b: Math.round(channel(hk - 1 / 3) * 255),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + to2(r) + to2(g) + to2(b);
}

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return null;
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Shortest angular distance between two hues, 0-180. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(((a % 360) + 360) % 360 - ((b % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

function isNearWhite(hsl: Hsl): boolean {
  return hsl.l >= NEAR_WHITE_L && hsl.s < NEUTRAL_SAT;
}

function isNearBlack(hsl: Hsl): boolean {
  return hsl.l <= NEAR_BLACK_L && hsl.s < NEUTRAL_SAT;
}

// --- bucketing --------------------------------------------------------------

interface Bucket {
  key: string;
  count: number;
  /** Running sums, so the emitted colour is the bucket's true centroid. */
  sumR: number;
  sumG: number;
  sumB: number;
}

function bucketKey(hsl: Hsl): string {
  // 24 hue bins (15deg), 4 saturation bins, 5 lightness bins. Coarse enough to
  // merge anti-aliasing haloes, fine enough to keep a red distinct from an
  // orange.
  const hBin = Math.floor((((hsl.h % 360) + 360) % 360) / 15);
  const sBin = Math.min(3, Math.floor(hsl.s * 4));
  const lBin = Math.min(4, Math.floor(hsl.l * 5));
  return hBin + ':' + sBin + ':' + lBin;
}

function centroid(b: Bucket): Rgb {
  return { r: b.sumR / b.count, g: b.sumG / b.count, b: b.sumB / b.count };
}

export interface QuantizeOptions {
  /** Examine every Nth pixel. 1 = every pixel. */
  stride?: number;
}

/**
 * @param rgba flat RGBA bytes, length divisible by 4 (canvas ImageData.data shape)
 */
export function quantizePixels(
  rgba: ArrayLike<number>,
  opts: QuantizeOptions = {}
): QuantizeResult {
  const stride = Math.max(1, Math.floor(opts.stride ?? 1));
  const notes: string[] = [];

  const chromaticBuckets = new Map<string, Bucket>();
  const neutralBuckets = new Map<string, Bucket>();

  let sampled = 0;
  let transparent = 0;
  let nearWhite = 0;
  let nearBlack = 0;
  let neutral = 0;
  let chromatic = 0;

  for (let i = 0; i + 3 < rgba.length; i += 4 * stride) {
    sampled += 1;
    const a = rgba[i + 3] ?? 0;

    // CASE 1 — transparency, handled before anything reads the colour channels.
    if (a < ALPHA_FLOOR) {
      transparent += 1;
      continue;
    }

    const rgb: Rgb = { r: rgba[i] ?? 0, g: rgba[i + 1] ?? 0, b: rgba[i + 2] ?? 0 };
    const hsl = rgbToHsl(rgb);

    // CASES 2 & 3 — background rejection, symmetric by construction.
    if (isNearWhite(hsl)) {
      nearWhite += 1;
      continue;
    }
    if (isNearBlack(hsl)) {
      nearBlack += 1;
      continue;
    }

    const key = bucketKey(hsl);
    const target = hsl.s < NEUTRAL_SAT ? neutralBuckets : chromaticBuckets;
    if (hsl.s < NEUTRAL_SAT) neutral += 1;
    else chromatic += 1;

    const existing = target.get(key);
    if (existing) {
      existing.count += 1;
      existing.sumR += rgb.r;
      existing.sumG += rgb.g;
      existing.sumB += rgb.b;
    } else {
      target.set(key, { key, count: 1, sumR: rgb.r, sumG: rgb.g, sumB: rgb.b });
    }
  }

  const stats = { sampled, transparent, nearWhite, nearBlack, neutral, chromatic };

  if (nearWhite > 0) notes.push('Ignored ' + nearWhite + ' near-white background pixels.');
  if (nearBlack > 0) notes.push('Ignored ' + nearBlack + ' near-black background pixels.');
  if (transparent > 0) notes.push('Ignored ' + transparent + ' transparent pixels.');

  // Drop noise buckets (anti-aliasing fringes, JPEG artefacts).
  const chromaticList = [...chromaticBuckets.values()]
    .filter((b) => b.count / Math.max(1, chromatic) >= MIN_BUCKET_SHARE)
    .sort((a, b) => b.count - a.count);

  // ---- CASE 4: monochrome ------------------------------------------------
  if (chromaticList.length === 0) {
    const neutralList = [...neutralBuckets.values()].sort((a, b) => b.count - a.count);
    if (neutralList.length === 0) {
      notes.push('No usable pixels found.');
      return { primaryHex: null, secondaryHex: null, accentHex: null, detectedCase: 'empty', notes, stats };
    }
    // The darkest surviving grey reads as "the logo" far more reliably than
    // the most common one, which on a light card is usually a mid halo.
    const darkest = neutralList
      .map((b) => ({ b, rgb: centroid(b) }))
      .sort((x, y) => rgbToHsl(x.rgb).l - rgbToHsl(y.rgb).l)[0];
    notes.push('Monochrome logo: no hue present. Accent left for the house token rather than invented.');
    return {
      primaryHex: darkest ? rgbToHex(darkest.rgb) : null,
      secondaryHex: null,
      accentHex: null,
      detectedCase: 'monochrome',
      notes,
      stats,
    };
  }

  const primaryBucket = chromaticList[0]!;
  const primaryRgb = centroid(primaryBucket);
  const primaryHsl = rgbToHsl(primaryRgb);

  // ---- CASE 5: single colour ---------------------------------------------
  const distinct = chromaticList.filter(
    (b) => hueDistance(rgbToHsl(centroid(b)).h, primaryHsl.h) >= HUE_SEPARATION
  );

  if (distinct.length === 0) {
    notes.push('Single-colour logo: one hue family only. Secondary and accent derived downstream.');
    return {
      primaryHex: rgbToHex(primaryRgb),
      secondaryHex: null,
      accentHex: null,
      detectedCase: 'single_colour',
      notes,
      stats,
    };
  }

  // ---- normal path + CASE 6: small vivid accent --------------------------
  const secondaryBucket = distinct[0]!;
  const secondaryRgb = centroid(secondaryBucket);

  // The accent slot ranks by vividness against a SUBLINEAR count term, so a
  // small saturated mark can beat a large muted field here even though it
  // could never win the primary slot.
  const accentCandidates = chromaticList
    .map((b) => {
      const rgb = centroid(b);
      const hsl = rgbToHsl(rgb);
      return { b, rgb, hsl, score: hsl.s * Math.pow(b.count, ACCENT_COUNT_EXPONENT) };
    })
    .filter((c) => hueDistance(c.hsl.h, primaryHsl.h) >= HUE_SEPARATION)
    .sort((a, b) => b.score - a.score);

  const accent = accentCandidates[0];
  if (accent && accent.b.key !== secondaryBucket.key) {
    notes.push('Accent selected by vividness, not volume — a small bright mark outranks a large muted one.');
  }

  return {
    primaryHex: rgbToHex(primaryRgb),
    secondaryHex: rgbToHex(secondaryRgb),
    accentHex: accent ? rgbToHex(accent.rgb) : null,
    detectedCase: 'chromatic',
    notes,
    stats,
  };
}
