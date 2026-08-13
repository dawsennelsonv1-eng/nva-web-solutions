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

export function buildSwatchPrompt(s: SwatchSubject): string {
  const colour = s.hex
    ? `Keep the base colour of the supplied image (${s.hex.toUpperCase()}) — that exact colour is the finish being shown, and the sample must match it.`
    : `The supplied image is a neutral grey substrate, not the subject. Do not preserve it as a colour choice: it is there to be finished. Keep it neutral and let the surface treatment be what changes.`;

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
