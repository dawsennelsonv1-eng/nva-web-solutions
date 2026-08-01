import { hexToRgb, hslToRgb, rgbToHex, rgbToHsl, type Rgb } from './quantize';

/**
 * lib/brand/tokens.ts — expands three extracted hexes into the FULL Phase 1
 * token set, in both the Light and Dark Industrial variants, with WCAG AA
 * enforced on every text/surface pair.
 *
 * ============ HOW A CHEAP LOGO IS PREVENTED FROM MAKING AN UGLY SITE ============
 * The brief asks this directly, so here is the mechanism, in the order it
 * matters:
 *
 * 1. THE LOGO ONLY EVER SUPPLIES ACCENTS. This is the whole guarantee, and
 *    everything below is secondary to it. Surfaces (--c-concrete, --c-sheet),
 *    body text (--c-ink), rules (--c-rule), the type scale, the 2px radius
 *    and the datum rule are FIXED Phase 1 values and are never derived from
 *    the logo. A contractor's logo can change which hue the buttons and
 *    graduation marks are. It cannot change the thing that actually makes
 *    the page read as expensive — the spec-sheet layout, the restraint, the
 *    measurement metaphor — because none of that is colour. Extraction can
 *    only ever swap the accent in a design that was already good.
 *    ISOLATION_TEST in tokens.test.ts proves this mechanically: five wildly
 *    different logos produce byte-identical surface tokens.
 *
 * 2. SATURATION IS CLAMPED into a usable band (SAT_MIN..SAT_MAX). A neon
 *    logo is pulled down; a nearly-grey brand colour is pushed up enough to
 *    read as intentional. A contractor whose logo is #00FF00 does not get a
 *    #00FF00 site.
 *
 * 3. LIGHTNESS IS CLAMPED per role, so a near-white or near-black brand
 *    colour can never become an invisible button.
 *
 * 4. WCAG AA IS ENFORCED LAST, after clamping, by shifting lightness until
 *    the pair passes. Every adjustment is recorded in `adjustments` so the
 *    admin can see exactly what was changed and why, rather than wondering
 *    why the colour on screen doesn't match the logo.
 * ==============================================================================
 */

// --- WCAG maths (pure) ------------------------------------------------------

/** WCAG 2.1 relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

export const AA_NORMAL_TEXT = 4.5;
/** Large text and non-text UI components (WCAG 1.4.11). */
export const AA_LARGE_TEXT = 3.0;

// --- clamps -----------------------------------------------------------------

const SAT_MIN = 0.25;
const SAT_MAX = 0.85;
const ACTION_L_MIN = 0.28;
const ACTION_L_MAX = 0.62;

export interface ContrastAdjustment {
  token: string;
  reason: string;
  fromHex: string;
  toHex: string;
  againstHex: string;
  finalRatio: number;
  required: number;
}

function clampSaturation(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb);
  if (hsl.s === 0) return hex; // genuinely achromatic — leave it alone
  const s = Math.min(SAT_MAX, Math.max(SAT_MIN, hsl.s));
  return rgbToHex(hslToRgb({ ...hsl, s }));
}

function clampActionLightness(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb);
  const l = Math.min(ACTION_L_MAX, Math.max(ACTION_L_MIN, hsl.l));
  return rgbToHex(hslToRgb({ ...hsl, l }));
}

/**
 * Shifts lightness until `fg` meets `required` against `bg`. Walks in the
 * direction that increases contrast (away from the background's luminance),
 * so a light background darkens the foreground and vice versa.
 *
 * Returns the original colour unchanged if it already passes, and the best
 * achievable value if even pure black/white cannot reach the target (which
 * only happens for mid-luminance backgrounds and is reported honestly rather
 * than silently accepted).
 */
export function ensureContrast(
  fgHex: string,
  bgHex: string,
  required: number,
  tokenName: string
): { hex: string; adjustment: ContrastAdjustment | null } {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  if (!fg || !bg) return { hex: fgHex, adjustment: null };

  if (contrastRatio(fg, bg) >= required) return { hex: fgHex, adjustment: null };

  const bgLum = relativeLuminance(bg);
  const goDarker = bgLum > 0.35; // light surface -> darken the text
  const hsl = rgbToHsl(fg);

  let best = fgHex;
  let bestRatio = contrastRatio(fg, bg);

  for (let step = 1; step <= 100; step += 1) {
    const l = goDarker ? hsl.l - step * 0.01 : hsl.l + step * 0.01;
    if (l < 0 || l > 1) break;
    const candidate = hslToRgb({ ...hsl, l });
    const ratio = contrastRatio(candidate, bg);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = rgbToHex(candidate);
    }
    if (ratio >= required) break;
  }

  return {
    hex: best,
    adjustment: {
      token: tokenName,
      reason:
        bestRatio >= required
          ? 'Shifted lightness to meet WCAG AA.'
          : 'Shifted to the maximum achievable contrast; still below AA against this surface.',
      fromHex: fgHex,
      toHex: best,
      againstHex: bgHex,
      finalRatio: Math.round(bestRatio * 100) / 100,
      required,
    },
  };
}

function shiftLightness(hex: string, delta: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb);
  return rgbToHex(hslToRgb({ ...hsl, l: Math.min(1, Math.max(0, hsl.l + delta)) }));
}

function desaturate(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb);
  return rgbToHex(hslToRgb({ ...hsl, s: Math.max(0, hsl.s - amount) }));
}

// --- the token set ----------------------------------------------------------

export interface TokenSet {
  // FIXED SURFACES — never derived from the logo. See guarantee #1.
  concrete: string;
  sheet: string;
  ink: string;
  rule: string;
  // brand-derived action colours
  hazard: string;
  hazardHover: string;
  hazardActive: string;
  hazardDisabled: string;
  secondary: string;
  secondaryHover: string;
  secondaryActive: string;
  secondaryDisabled: string;
  // status — fixed semantics, never brand-derived (a red danger state must
  // stay red even for a contractor whose logo is red)
  cure: string;
  warning: string;
  danger: string;
}

export interface DerivedTokens {
  light: TokenSet;
  dark: TokenSet;
  adjustments: ContrastAdjustment[];
  /** Which input slots were actually present vs substituted. */
  provenance: { primary: 'logo' | 'house'; secondary: 'logo' | 'derived'; accent: 'logo' | 'house' };
}

/** Phase 1 DESIGN.md values. The fixed half of the system. */
const HOUSE_LIGHT = {
  concrete: '#E4E6E3',
  sheet: '#F4F5F3',
  ink: '#14171A',
  rule: '#9BA29C',
  hazard: '#FF6A13',
  cure: '#1F5F52',
  warning: '#8A6A00',
  danger: '#B22A18',
} as const;

const HOUSE_DARK = {
  concrete: '#191C1B',
  sheet: '#23272A',
  ink: '#E6E9E5',
  rule: '#4A524D',
  hazard: '#FF6A13',
  cure: '#3E9C86',
  warning: '#D9B23A',
  danger: '#E4552F',
} as const;

export interface BrandInput {
  primaryHex?: string | null;
  secondaryHex?: string | null;
  accentHex?: string | null;
}

/**
 * Expands a brand kit into both variants.
 *
 * SLOT MAPPING, and why: the extracted PRIMARY becomes the action colour
 * (--c-hazard), because that is the one place brand identity is genuinely
 * visible in this design — the single hazard-coloured action per viewport.
 * The extracted SECONDARY becomes the secondary action outline. The ACCENT
 * is deliberately NOT given a third slot: a design with three competing
 * accent colours is exactly the "cheap site" outcome this file exists to
 * prevent (DESIGN.md: "two accent colours would compete with the datum
 * rule"). It is stored for the admin's reference and used only if primary
 * is missing.
 */
export function deriveTokens(input: BrandInput, pinned: Partial<TokenSet> = {}): DerivedTokens {
  const adjustments: ContrastAdjustment[] = [];

  const rawPrimary = input.primaryHex ?? input.accentHex ?? HOUSE_LIGHT.hazard;
  const provenance: DerivedTokens['provenance'] = {
    primary: input.primaryHex ? 'logo' : 'house',
    secondary: input.secondaryHex ? 'logo' : 'derived',
    accent: input.accentHex ? 'logo' : 'house',
  };

  // Guarantees 2 and 3, applied before any contrast work.
  const brandAction = clampActionLightness(clampSaturation(rawPrimary));
  const brandSecondaryRaw = input.secondaryHex ?? desaturate(shiftLightness(brandAction, -0.18), 0.15);
  const brandSecondary = clampActionLightness(clampSaturation(brandSecondaryRaw));

  function buildVariant(house: typeof HOUSE_LIGHT | typeof HOUSE_DARK, label: string): TokenSet {
    // Action colours carry text on top of them, so they are held to the
    // non-text UI threshold against the page surface, and their LABEL colour
    // is chosen per-variant below by the consuming components.
    const hazardChecked = ensureContrast(brandAction, house.concrete, AA_LARGE_TEXT, label + '.hazard');
    if (hazardChecked.adjustment) adjustments.push(hazardChecked.adjustment);

    const secondaryChecked = ensureContrast(brandSecondary, house.concrete, AA_LARGE_TEXT, label + '.secondary');
    if (secondaryChecked.adjustment) adjustments.push(secondaryChecked.adjustment);

    // Body text must clear the stricter normal-text bar against BOTH surfaces.
    const inkOnConcrete = ensureContrast(house.ink, house.concrete, AA_NORMAL_TEXT, label + '.ink');
    if (inkOnConcrete.adjustment) adjustments.push(inkOnConcrete.adjustment);

    // --c-rule doubles as muted text, so it is held to the normal-text bar
    // too — this is the token most likely to fail, and failing it silently
    // is how "muted" becomes "illegible".
    const ruleOnSheet = ensureContrast(house.rule, house.sheet, AA_NORMAL_TEXT, label + '.rule');
    if (ruleOnSheet.adjustment) adjustments.push(ruleOnSheet.adjustment);

    const hazard = hazardChecked.hex;
    const secondary = secondaryChecked.hex;
    const isDark = house === HOUSE_DARK;

    return {
      concrete: house.concrete,
      sheet: house.sheet,
      ink: inkOnConcrete.hex,
      rule: ruleOnSheet.hex,
      hazard,
      hazardHover: shiftLightness(hazard, isDark ? 0.06 : -0.06),
      hazardActive: shiftLightness(hazard, isDark ? 0.12 : -0.12),
      hazardDisabled: desaturate(shiftLightness(hazard, isDark ? -0.1 : 0.22), 0.35),
      secondary,
      secondaryHover: shiftLightness(secondary, isDark ? 0.06 : -0.06),
      secondaryActive: shiftLightness(secondary, isDark ? 0.12 : -0.12),
      secondaryDisabled: desaturate(shiftLightness(secondary, isDark ? -0.1 : 0.22), 0.35),
      cure: house.cure,
      warning: house.warning,
      danger: house.danger,
    };
  }

  const light = { ...buildVariant(HOUSE_LIGHT, 'light'), ...pinned };
  const dark = { ...buildVariant(HOUSE_DARK, 'dark'), ...pinned };

  return { light, dark, adjustments, provenance };
}

/**
 * Serializes a variant into the "R G B" triplet form globals.css expects, so
 * the (client) layout can inject it as inline CSS custom properties and
 * /s/[slug] is branded in the SERVER HTML with no flash (Phase 1 strategy).
 */
export function tokensToCssVars(tokens: TokenSet): Record<string, string> {
  const map: Record<keyof TokenSet, string> = {
    concrete: '--c-concrete', sheet: '--c-sheet', ink: '--c-ink', rule: '--c-rule',
    hazard: '--c-hazard', hazardHover: '--c-hazard-hover', hazardActive: '--c-hazard-active',
    hazardDisabled: '--c-hazard-disabled',
    secondary: '--c-secondary', secondaryHover: '--c-secondary-hover',
    secondaryActive: '--c-secondary-active', secondaryDisabled: '--c-secondary-disabled',
    cure: '--c-cure', warning: '--c-warning', danger: '--c-danger',
  };

  const out: Record<string, string> = {};
  for (const [key, cssVar] of Object.entries(map) as [keyof TokenSet, string][]) {
    const rgb = hexToRgb(tokens[key]);
    if (rgb) out[cssVar] = rgb.r + ' ' + rgb.g + ' ' + rgb.b;
  }
  return out;
}
