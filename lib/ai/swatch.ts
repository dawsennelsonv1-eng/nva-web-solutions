import 'server-only';
import { deflateSync } from 'node:zlib';

/**
 * lib/ai/swatch.ts — turning a hex code and a phrase into a material sample.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS AT ALL
 * ============================================================================
 *
 * Every option in lib/verticals/epoxy/options.ts already carries the two
 * things a swatch needs: a `hex` the picker paints as a flat block, and a
 * `renderHint` written for an image model ("black, white and grey vinyl flake
 * blend"). What is missing is a photograph, and there are 53 of them to shoot.
 *
 * ============================================================================
 * IT IS AN EDIT, NOT A GENERATION, AND THAT IS THE WHOLE TRICK
 * ============================================================================
 *
 * renderFinishImage requires a `referenceDataUrl`. That requirement is
 * deliberate and correct — it is what stops the visualiser inventing a garage
 * instead of editing the homeowner's own.
 *
 * A swatch has no photograph to start from. So we MAKE one: a flat tile of the
 * option's exact hex, generated here, handed over as the reference, with a
 * prompt asking the model to turn that colour into a photographic sample of
 * the material.
 *
 * That is better than a free generation, not a workaround for one. Asked cold
 * for "sandstone epoxy", a model returns some beige. Given #C4AE92 and told to
 * keep it, the swatch it produces MATCHES THE HEX THE PICKER PAINTS — so the
 * flat colour a visitor sees before the images load and the photograph he sees
 * afterwards are the same colour. Without the tile they would drift, and the
 * picker would appear to change its mind as it loaded.
 */

// ---------------------------------------------------------------------------
// a solid PNG, from nothing
// ---------------------------------------------------------------------------

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k += 1) {
      // 0xEDB88320 is the reversed CRC-32 polynomial. Computed inline rather
      // than from a lookup table: this runs 53 times in an admin session, not
      // in a request path, and a table is 1KB of state to get wrong.
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

/** '#C4AE92' or 'C4AE92' to three bytes. Null on anything else. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * A square PNG of one colour, as a data URL.
 *
 * WRITTEN BY HAND RATHER THAN WITH A LIBRARY. sharp is a native binary that
 * has to match the deployment's architecture, canvas needs system libraries,
 * and both are a lot of surface area to add for an image with one colour in
 * it. node:zlib is in the standard library and PNG's format for this case is
 * about forty lines: a signature, a header, deflated scanlines, an end marker.
 *
 * 768px because the image models size their output from the reference, and a
 * tile smaller than the swatch will be displayed at invites an upscale.
 */
export function solidPngDataUrl(hex: string, size = 768): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb;

  // Raw scanlines. Each row is prefixed with a filter byte; 0 means "none",
  // which is the right choice for flat colour — the fancy filters exist to
  // help compression find patterns, and there is nothing here to find.
  const row = Buffer.alloc(1 + size * 3);
  row[0] = 0;
  for (let x = 0; x < size; x += 1) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  return 'data:image/png;base64,' + png.toString('base64');
}

// ---------------------------------------------------------------------------
// a speckled PNG, from the words the catalogue already wrote
// ---------------------------------------------------------------------------

/**
 * ============================================================================
 * WHY A FLAT TILE WAS NOT ENOUGH, AND WHAT REPLACED IT. PHASE 63.
 * ============================================================================
 *
 * THE COMPLAINT: the generated swatches were not distinguishable from one
 * another. Ten flake blends came back as ten similar grey-brown textures.
 *
 * IT WAS NOT THE PROMPT. `buildSwatchPrompt` already passes the renderHint, the
 * human blurb, per-group guidance about chip scale, and a full set of
 * negatives. As instructions go it is close to as good as text gets.
 *
 * IT WAS THE REFERENCE IMAGE. `renderFinishImage` performs an EDIT, anchored on
 * the picture it is given, and every swatch was anchored on
 * `solidPngDataUrl(hex)` — ONE flat colour. Read what the catalogue says these
 * blends are:
 *
 *   Domino       'black, white and grey vinyl flake blend'      hex #7C7F82
 *   Granite      'grey and off-white granite-look flake blend'  hex #8D8F8C
 *   Tuxedo       'high-contrast black and white flake blend'    hex #5A5C5E
 *   Silver fox   'pale grey and silver flake blend'             hex #A8ABAD
 *
 * Four different materials, and the model received four almost identical grey
 * squares. A single hex CANNOT represent a multi-coloured chip blend — it is
 * the average of one, and every grey blend averages to the same grey. The words
 * were carrying the entire difference while the picture argued they were all
 * the same, and in an image edit the picture wins.
 *
 * THE FIX: build the reference out of the palette the renderHint already names.
 * 'brown, tan and cream flake blend' becomes a tile actually speckled in brown,
 * tan and cream. Now the reference for Cappuccino and the reference for Sedona
 * are visibly different pictures before a single word is read, and the model's
 * job changes from inventing a blend to photographing the one it was handed.
 *
 * SOLID COLOURS KEEP THE FLAT TILE. For Slate grey or Tile red the flat tile is
 * exactly right and the original reasoning stands untouched: the hex the picker
 * paints must match the photograph that replaces it. Only the groups whose
 * materials are inherently multi-coloured get a speckled reference.
 */

/**
 * The colour words that appear in this catalogue's renderHints, mapped to the
 * pigments they name.
 *
 * DERIVED FROM THE ACTUAL STRINGS IN lib/verticals/epoxy/options.ts, not from a
 * general colour list. Every entry below earns its place by appearing in a
 * renderHint that needs it, which is why 'champagne' and 'burl' are here and
 * 'magenta' is not.
 *
 * ORDER MATTERS AND THE ORDER IS LONGEST FIRST. 'off-white' has to be tested
 * before 'white' or it matches as 'white' and loses its warmth; 'blue-grey'
 * before both 'blue' and 'grey'. The lookup below relies on this, so new
 * entries go in by length, not alphabetically.
 *
 * LONGEST-FIRST IS NECESSARY AND NOT SUFFICIENT, which a test caught and
 * reading did not. Ordering decides which word is tried first; it does not stop
 * the shorter one ALSO matching, because 'off-white' still contains 'white' as
 * a substring. Granite — 'grey and off-white granite-look flake blend' — came
 * out as off-white PLUS white PLUS grey: three entries, two of them nearly the
 * same colour, in a blend the catalogue describes with two. Coastal was worse,
 * matching 'blue-grey', then 'white', then 'grey' and 'blue' out of the middle
 * of 'blue-grey', filling all four palette slots with two colours' worth of
 * information.
 *
 * So `paletteFromHint` CONSUMES each word as it matches it. See the comment
 * there — the ordering and the consumption only work together.
 */
const COLOUR_WORDS: ReadonlyArray<readonly [string, string]> = [
  ['off-white', '#EDE9E0'],
  ['blue-grey', '#6C8296'],
  ['pale grey', '#B9BCBE'],
  ['champagne', '#E0CFB0'],
  ['terracotta', '#8E4436'],
  ['burgundy', '#6E3A44'],
  ['charcoal', '#3C4045'],
  ['sandstone', '#C4AE92'],
  ['emerald', '#245245'],
  ['bronze', '#8A6A3B'],
  ['copper', '#A6642F'],
  ['silver', '#C3C7CA'],
  ['orange', '#C2622A'],
  ['pearl', '#E4E2DC'],
  ['cream', '#E8DCC4'],
  ['green', '#4F6350'],
  ['brown', '#6B4A32'],
  ['beige', '#C9B392'],
  ['black', '#1E2022'],
  ['white', '#F2F1ED'],
  ['slate', '#6B7076'],
  ['grey', '#8D8F8C'],
  ['gray', '#8D8F8C'],
  ['gold', '#B08D45'],
  ['rust', '#8E4F30'],
  ['blue', '#2F5B8C'],
  ['tan', '#BFA47F'],
  ['red', '#8E4436'],
  ['jet', '#1E2022'],
];

function shade(rgb: [number, number, number], factor: number): [number, number, number] {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return [clamp(rgb[0] * factor), clamp(rgb[1] * factor), clamp(rgb[2] * factor)];
}

/**
 * The chip palette for one option, read out of its renderHint.
 *
 * FALLS BACK RATHER THAN FAILING. A hint naming fewer than two colours still
 * has to produce a usable tile, so the option's own hex is shaded lighter and
 * darker to make a plausible three-tone blend. That is a weaker reference than
 * named pigments but a far better one than flat colour, and it means a new
 * catalogue entry with a terse hint never breaks the generator.
 *
 * CAPPED AT FOUR. Real flake blends are two to four colours; a longer palette
 * reads as confetti and stops looking like a product.
 */
export function paletteFromHint(renderHint: string, baseHex: string | null): string[] {
  /*
   * `remaining` is consumed as words match. Matching 'off-white' blanks those
   * nine characters, so the later, shorter 'white' has nothing left to find —
   * which is the only thing that stops one written colour becoming two palette
   * entries. Testing against the original string would reintroduce exactly the
   * bug documented above COLOUR_WORDS.
   */
  let remaining = renderHint.toLowerCase();
  const found: string[] = [];

  for (const entry of COLOUR_WORDS) {
    const word = entry[0];
    const hex = entry[1];
    if (found.length >= 4) break;
    if (!remaining.includes(word)) continue;
    remaining = remaining.split(word).join(' ');
    if (!found.includes(hex)) found.push(hex);
  }

  if (found.length >= 2) return found;

  const base = parseHex(baseHex ?? NEUTRAL_BASE_HEX);
  if (!base) return found.length > 0 ? found : ['#8D8F8C'];

  const toHex = (c: [number, number, number]) =>
    '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

  return [toHex(shade(base, 0.62)), toHex(base), toHex(shade(base, 1.28))];
}

/**
 * A tiny deterministic PRNG (mulberry32).
 *
 * DETERMINISTIC ON PURPOSE. Regenerating Domino must hand the model the same
 * reference it had last time, or a swatch that came out well cannot be
 * reproduced and a swatch that came out badly cannot be diagnosed. Math.random
 * would make every generation a different experiment.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A square PNG of chips scattered in resin, as a data URL.
 *
 * IT IS A SCHEMATIC, NOT AN ATTEMPT AT PHOTOGRAPHY. Axis-aligned rectangles of
 * varied size on a darkened base, plus light per-pixel noise. It is not trying
 * to look like a real floor — the model does that. Its only jobs are to state
 * the palette, state the density, and be a DIFFERENT picture for every blend.
 * Chasing realism here would be spending effort on the input to an image model
 * that is far better at realism than forty lines of pixel-pushing.
 *
 * CHIP SIZE IS TIED TO THE FRAME because the prompt tells the model the frame
 * is roughly a foot across and the chips are about a quarter inch. At 768px
 * that is around 16px, and the range below straddles it so the scatter has the
 * size variation a broadcast floor actually has.
 */
export function speckledPngDataUrl(
  palette: readonly string[],
  seedText: string,
  size = 768
): string | null {
  const chips: Array<[number, number, number]> = [];
  for (const hex of palette) {
    const rgb = parseHex(hex);
    if (rgb) chips.push(rgb);
  }
  if (chips.length === 0) return null;

  // The resin between the chips: the darkest chip, darkened further. A base
  // lighter than its chips makes the chips read as holes.
  let darkest = chips[0]!;
  for (const c of chips) {
    if (c[0] + c[1] + c[2] < darkest[0] + darkest[1] + darkest[2]) darkest = c;
  }
  const base = shade(darkest, 0.55);

  // Row-major RGB, no alpha. Filter bytes are added at the end.
  const px = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i += 1) {
    px[i * 3] = base[0];
    px[i * 3 + 1] = base[1];
    px[i * 3 + 2] = base[2];
  }

  const rand = mulberry32(seedFrom(seedText));
  const minChip = Math.max(4, Math.round(size / 64));
  const maxChip = Math.max(minChip + 2, Math.round(size / 30));

  // Enough chips to cover the frame densely with overlap. `1.35` is the
  // overdraw factor that gets to roughly 80% coverage once overlaps are
  // accounted for — dense enough to read as a broadcast floor, open enough that
  // the resin still shows between chips, which the prompt asks for.
  const avgChip = (minChip + maxChip) / 2;
  const count = Math.round(((size * size) / (avgChip * avgChip)) * 1.35);

  for (let n = 0; n < count; n += 1) {
    const colour = chips[Math.floor(rand() * chips.length)]!;
    const w = minChip + Math.floor(rand() * (maxChip - minChip + 1));
    const h = minChip + Math.floor(rand() * (maxChip - minChip + 1));
    const x0 = Math.floor(rand() * size);
    const y0 = Math.floor(rand() * size);

    // Per-chip brightness jitter. Real flake catches light at different angles,
    // and a palette drawn at exactly three flat values reads as printed dots.
    const jitter = 0.86 + rand() * 0.28;
    const c = shade(colour, jitter);

    for (let y = y0; y < y0 + h && y < size; y += 1) {
      for (let x = x0; x < x0 + w && x < size; x += 1) {
        const i = (y * size + x) * 3;
        px[i] = c[0];
        px[i + 1] = c[1];
        px[i + 2] = c[2];
      }
    }
  }

  // Scanlines with their filter bytes. Same choice as solidPngDataUrl and for
  // the same reason: filter 0, because deflate has plenty to work with here.
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0;
    px.copy(row, 1, y * size * 3, (y + 1) * size * 3);
    rows.push(row);
  }
  const raw = Buffer.concat(rows);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  return 'data:image/png;base64,' + png.toString('base64');
}

/** The groups whose materials are multi-coloured by nature, and therefore
 *  cannot be represented by one hex. Everything else keeps the flat tile. */
export function wantsSpeckledReference(groupKey: string): boolean {
  return groupKey === 'flake_blend' || groupKey === 'quartz_colour';
}

// ---------------------------------------------------------------------------
// the instruction
// ---------------------------------------------------------------------------

export interface SwatchSubject {
  groupKey: string;
  label: string;
  renderHint: string;
  /** Null for options that describe work or sheen rather than a colour. */
  hex: string | null;
  /**
   * The catalogue's own sentence for the visitor — "Wet-look shine. The
   * showroom finish."
   *
   * IT GOES IN THE PROMPT, and it is the cheapest quality win available here.
   * `renderHint` was written as a terse noun phrase for an image model;
   * `blurb` was written by a person explaining what the finish is LIKE. A
   * model given both produces a better sample than one given either, and the
   * catalogue already carries it for all 53 options, so it costs nothing to
   * add and no entry has to be edited.
   */
  blurb: string;
  /**
   * Which kind of tile was actually sent as the reference. PHASE 63.
   *
   * THE PROMPT HAS TO DESCRIBE THE PICTURE IT WAS GIVEN. Telling the model to
   * 'keep the base colour of the supplied image' when the supplied image is a
   * three-colour scatter is an instruction it cannot follow — there is no
   * single base colour in it — and the likely result is that it averages the
   * scatter to obey, which throws away exactly the information the scatter was
   * built to carry. Passed in rather than re-derived so the tile and the
   * sentence describing it can never disagree.
   */
  reference: 'solid' | 'speckle';
  /** The palette the speckled tile was drawn from, for naming in the prompt. */
  palette?: readonly string[];
}

/**
 * ============================================================================
 * THE BASE TILE FOR OPTIONS WITH NO COLOUR OF THEIR OWN.
 * ============================================================================
 *
 * Phase 13 refused to generate anything without a `hex` and disabled those
 * buttons. That was wrong, and the topcoat group is the proof: satin, high
 * gloss, matte and polyaspartic clear are pure APPEARANCE — they are the most
 * visual decision in the tool after the coating itself — and every one of them
 * was locked out for the technicality of having no dominant colour.
 *
 * The reasoning was that a hexless option has no tile to anchor the model, so
 * generation would drift. The premise was right and the conclusion was wrong:
 * an option with no colour of its own still has a SURFACE, and what it needs
 * is a neutral base to demonstrate that surface on.
 *
 * #9A9A97 is a mid-grey with a faint warm cast — cured concrete, and the
 * substrate every one of these finishes is actually applied over. A sheen
 * shown on neutral grey reads as sheen. On white it reads as blown-out; on
 * black, as nothing at all.
 */
export const NEUTRAL_BASE_HEX = '#9A9A97';

/**
 * The prompt, written as constraints rather than as a description.
 *
 * EVERY CLAUSE IS A THING THAT WENT WRONG IN AN OBVIOUS FIRST DRAFT:
 *
 *   "top-down, flat on"   — asked for a sample, models produce a styled
 *                           three-quarter shot of a whole floor with a wall
 *                           and a shadow. Fifty-three of those do not tile
 *                           into a grid.
 *   "fills the frame"     — otherwise it centres a small tile on a backdrop,
 *                           and the swatch shows mostly backdrop.
 *   "keep the base colour"— the reason the flat tile is passed at all. Without
 *                           saying it, the model treats the colour as a
 *                           suggestion and the picker's hex stops matching.
 *   "no text, no ruler"   — image models put labels and scale bars on anything
 *                           that looks like a material sample.
 *   "even, diffuse light" — a hard highlight reads as a defect in a floor
 *                           finish, which is the opposite of the message.
 */
/**
 * WHAT EACH GROUP IS ACTUALLY SHOWING.
 *
 * A swatch of a flake blend and a swatch of a topcoat are photographs of
 * different PROPERTIES — one is a pattern at a known scale, the other is how
 * light behaves on a surface. A single generic instruction produces a
 * plausible tile for the first and a meaningless grey square for the second.
 *
 * These clauses also matter beyond the swatch itself. The visualiser composes
 * a finish from several of these decisions at once, and a topcoat with no
 * description of how it REFLECTS gives the render nothing to apply — which is
 * very likely part of why combination previews have looked reluctant.
 */
function groupGuidance(groupKey: string): string {
  switch (groupKey) {
    case 'flake_blend':
    case 'quartz_colour':
      return 'Show the individual chips at true scale — roughly one quarter inch across — broadcast densely and randomly, with the resin visible between them.';
    case 'metallic_colour':
      return 'Show the pigment movement, the cloudy veining and the sense of depth beneath the surface that makes a metallic pour look like poured stone rather than paint.';
    case 'topcoat':
      return [
        'This sample is about SHEEN, not colour: the base grey is only a substrate to show the surface on.',
        'Convey the finish by how light behaves across it — the sharpness or softness of the reflection, the depth of the wet look, the way a distant highlight smears or stays crisp.',
        'The surface must read as a sealed, cured resin floor rather than as bare concrete.',
      ].join(' ');
    case 'prep':
      return 'Show the CONDITION and texture of the prepared slab surface itself — the profile left behind by this preparation, before any coating goes down.';
    case 'extras':
      return 'Show this detail applied to a finished resin floor, close enough that the addition itself is the subject.';
    default:
      return 'Show the surface texture of a cured resin floor at close range.';
  }
}

/**
 * ============================================================================
 * THREE DIFFERENT THINGS THE REFERENCE CAN BE. PHASE 63.
 * ============================================================================
 *
 * The single hardest clause in this prompt is the one about the supplied image,
 * because the supplied image is not always the same kind of thing:
 *
 *   A SOLID TILE OF THE OPTION'S HEX — a colour to be preserved exactly, so
 *   that the flat block the picker paints before the photograph loads matches
 *   the photograph that replaces it.
 *
 *   A SOLID TILE OF NEUTRAL GREY — not a colour choice at all, just a substrate
 *   for showing a sheen on. Preserving it as 'the colour' would be a mistake.
 *
 *   A SPECKLED SCATTER OF THE BLEND'S PALETTE — a statement of which pigments
 *   and in roughly what proportion. Here 'keep the base colour' is not merely
 *   unhelpful, it is impossible: there is no single base colour, and a model
 *   trying to comply would flatten the scatter to an average and discard the
 *   only thing that distinguishes this blend from the other nine.
 *
 * So the clause is chosen from the tile that was actually sent.
 */
function referenceClause(s: SwatchSubject): string {
  if (s.reference === 'speckle') {
    const named = (s.palette ?? []).map((h) => h.toUpperCase()).join(', ');
    return [
      'The supplied image is a SCHEMATIC of this blend, not a photograph: flat rectangles standing in for the flake chips, scattered at roughly the density the finished floor should have.',
      named
        ? `Reproduce these exact pigments in these proportions: ${named}.`
        : 'Reproduce the pigments and proportions shown.',
      'Render them as real vinyl flake chips embedded in cured clear resin — irregular edges, varied angles, catching the light differently across the frame — keeping the palette and the coverage of the schematic and discarding its flat, rectangular look entirely.',
      'Do not average these colours into a single tone. The distinct colours are the product.',
    ].join(' ');
  }

  return s.hex
    ? `Keep the base colour of the supplied image (${s.hex.toUpperCase()}) — that exact colour is the finish being shown, and the sample must match it.`
    : `The supplied image is a neutral grey substrate, not the subject. Do not preserve it as a colour choice: it is there to be finished. Keep it neutral and let the surface treatment be what changes.`;
}

export function buildSwatchPrompt(s: SwatchSubject): string {
  const colour = referenceClause(s);

  return [
    `A photographic close-up sample of a cured epoxy floor finish: ${s.renderHint}.`,
    // The human sentence. See SwatchSubject.blurb.
    s.blurb,
    groupGuidance(s.groupKey),
    'Shot top-down, flat on, filling the entire frame edge to edge like a material sample in a supplier catalogue.',
    colour,
    'Even, diffuse studio light. No hard highlights, no reflections of windows or lights, no visible defects.',
    'No text, no labels, no watermarks, no ruler or scale bar, no hands, no tools, no walls, no horizon, no room.',
  ].join(' ');
}
