/**
 * lib/quote/units.ts — turning what a person types into square feet.
 *
 * ============================================================================
 * WHY THIS IS A MODULE AND NOT SIX LINES INSIDE THE FORM
 * ============================================================================
 *
 * Everything here is arithmetic on numbers a homeowner typed, and the result
 * multiplies the entire quote linearly. A metre-to-foot factor that is wrong
 * in the fourth decimal is invisible on screen and is a 3% error on every
 * quote from a metric customer.
 *
 * Kept free of React, of 'server-only' and of every import so it can be
 * exercised directly by node --test the way lib/quote/pricing.ts already is.
 * A conversion table you cannot test without mounting a component is a
 * conversion table nobody tests.
 *
 * ============================================================================
 * THIS FILE PRODUCES A QUANTITY, NEVER A PRICE
 * ============================================================================
 *
 * Same boundary lib/quote/vision.ts enforces: nothing returned here is
 * denominated in money. The output is square feet, it goes into a vertical's
 * price() as an input, and pricing behaves identically whether the number came
 * from a photograph, from this form, or from a contractor typing it himself.
 */

// ---------------------------------------------------------------------------
// length
// ---------------------------------------------------------------------------

export type LengthUnitId = 'ft' | 'in' | 'm' | 'cm' | 'yd';

export interface LengthUnit {
  id: LengthUnitId;
  /** What the dropdown says. */
  label: string;
  /** What sits beside the number. */
  short: string;
  /** EXACT factor. See the note below on why these are not rounded. */
  toFeet: number;
}

/**
 * THE FACTORS ARE EXACT, NOT APPROXIMATE, AND THAT IS DELIBERATE.
 *
 * The international yard has been defined as exactly 0.9144 metres since 1959,
 * which makes one foot exactly 0.3048 m and one inch exactly 25.4 mm. So
 * 1 m = 1 / 0.3048 ft, written here as the division rather than as 3.28084 —
 * the rounded constant is wrong in the sixth decimal and there is no reason to
 * carry an error into a number that scales a quote.
 *
 * ORDERED BY WHAT A DALLAS-FORT WORTH HOMEOWNER REACHES FOR FIRST. Feet is the
 * default and the first entry; the metric pair is present because this tool is
 * white-labelled and a contractor in Toronto or Auckland is a plausible tenant,
 * and because a homeowner who measured in metres should not have to convert by
 * hand before he can use a tool that promises he does not need to measure.
 */
export const LENGTH_UNITS: readonly LengthUnit[] = [
  { id: 'ft', label: 'Feet', short: 'ft', toFeet: 1 },
  { id: 'in', label: 'Inches', short: 'in', toFeet: 1 / 12 },
  { id: 'm', label: 'Metres', short: 'm', toFeet: 1 / 0.3048 },
  { id: 'cm', label: 'Centimetres', short: 'cm', toFeet: 0.01 / 0.3048 },
  { id: 'yd', label: 'Yards', short: 'yd', toFeet: 3 },
];

// ---------------------------------------------------------------------------
// area
// ---------------------------------------------------------------------------

export type AreaUnitId = 'sqft' | 'sqm' | 'sqyd';

export interface AreaUnit {
  id: AreaUnitId;
  label: string;
  short: string;
  toSqft: number;
}

/**
 * AREA FACTORS ARE THE LENGTH FACTORS SQUARED, written out rather than derived
 * so a reader can check them against a reference without doing algebra:
 *
 *   1 m²  = (1 / 0.3048)²  = 10.7639104167...
 *   1 yd² = 3²             = 9 exactly
 *
 * NO SQUARE INCHES, NO ACRES, NO "SQUARES". Square inches are never how a
 * floor is described and offering them invites somebody to type 480 meaning
 * square feet and receive a quote for three and a third square feet. A
 * "square" is 100 sq ft in the roofing trade and means nothing in coatings.
 * Acres are three orders of magnitude outside sqftMax. Every unit in a
 * dropdown is a unit somebody can pick by accident, so the list is only the
 * ones a floor is genuinely measured in.
 */
export const AREA_UNITS: readonly AreaUnit[] = [
  { id: 'sqft', label: 'Square feet', short: 'sq ft', toSqft: 1 },
  { id: 'sqm', label: 'Square metres', short: 'm²', toSqft: (1 / 0.3048) * (1 / 0.3048) },
  { id: 'sqyd', label: 'Square yards', short: 'sq yd', toSqft: 9 },
];

// ---------------------------------------------------------------------------
// parsing
// ---------------------------------------------------------------------------

/**
 * A typed string to a positive finite number, or null.
 *
 * NULL RATHER THAN 0 ON FAILURE, and the distinction carries weight: 0 is a
 * number the form would happily multiply, and "0 sq ft" would sail through
 * into a quote as a real answer. null cannot be multiplied by accident.
 *
 * Commas are stripped because "1,200" is how a person writes twelve hundred
 * and `Number('1,200')` is NaN. A comma DECIMAL separator — "12,5" for twelve
 * and a half, which is how most of the metric world writes it — is not
 * supported here on purpose: "1,200" is genuinely ambiguous between the two
 * conventions, and silently reading it as 1.2 would be a hundredfold error
 * presented as a confident number. The input is type="number", so the browser
 * offers the right keypad and the right separator for the visitor's own
 * locale, which is the correct place to solve this.
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim();
  if (cleaned.length === 0) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// ---------------------------------------------------------------------------
// conversion
// ---------------------------------------------------------------------------

/**
 * Length x width, in one unit, to square feet. Returns null when either side
 * is missing or nonsensical, so a half-filled form produces no answer rather
 * than a wrong one.
 */
export function areaFromDimensions(
  lengthRaw: string,
  widthRaw: string,
  unitId: LengthUnitId
): number | null {
  const unit = LENGTH_UNITS.find((u) => u.id === unitId);
  if (!unit) return null;
  const l = parseAmount(lengthRaw);
  const w = parseAmount(widthRaw);
  if (l === null || w === null) return null;
  const sqft = l * unit.toFeet * (w * unit.toFeet);
  return Number.isFinite(sqft) && sqft > 0 ? sqft : null;
}

/** A single total, in one unit, to square feet. */
export function areaFromTotal(totalRaw: string, unitId: AreaUnitId): number | null {
  const unit = AREA_UNITS.find((u) => u.id === unitId);
  if (!unit) return null;
  const t = parseAmount(totalRaw);
  if (t === null) return null;
  const sqft = t * unit.toSqft;
  return Number.isFinite(sqft) && sqft > 0 ? sqft : null;
}

// ---------------------------------------------------------------------------
// what the answer is allowed to be
// ---------------------------------------------------------------------------

export type AreaVerdict =
  | { ok: true; sqft: number }
  | { ok: false; code: 'incomplete' | 'too_small' | 'too_large'; message: string };

/**
 * The last gate before a typed number becomes the quantity a quote is built
 * on.
 *
 * IT REFUSES RATHER THAN CLAMPS, and that is the whole point of the function.
 *
 * Clamping is what the old path did: `Math.min(max, Math.max(min, value))`.
 * Somebody who typed 40,000 — because he entered square inches, or added a
 * zero, or measured a warehouse this rate table was never built for — got
 * silently handed 6,000 and a confident price for it. He was never told his
 * number had been discarded, so he read the quote as an answer to the question
 * he asked. It was an answer to a different one.
 *
 * Out of range is a real answer here: this contractor does not price that job
 * from a website, and saying so is more useful than a number he will not
 * honour. The message names the bound, because "invalid" tells a person
 * nothing about what to do next.
 */
export function verdictFor(
  sqft: number | null,
  min: number,
  max: number
): AreaVerdict {
  if (sqft === null) {
    return {
      ok: false,
      code: 'incomplete',
      message: 'Fill both boxes and we will work out the area.',
    };
  }
  const rounded = Math.round(sqft);
  if (rounded < min) {
    return {
      ok: false,
      code: 'too_small',
      message: `That comes to ${formatSqft(rounded)} sq ft. This installer prices from ${formatSqft(min)} sq ft up — check the measurement, or call them for a floor this size.`,
    };
  }
  if (rounded > max) {
    return {
      ok: false,
      code: 'too_large',
      message: `That comes to ${formatSqft(rounded)} sq ft, which is past the ${formatSqft(max)} sq ft this tool prices. Check the units, or call the installer directly for a floor this size.`,
    };
  }
  return { ok: true, sqft: rounded };
}

/** One place that decides how a square footage is written down. */
export function formatSqft(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/**
 * "12 ft x 18 ft" — the visitor's own numbers, echoed back in his own units.
 *
 * Shown beside the converted figure so a metric entry reads as
 * "3.7 m x 5.5 m — 219 sq ft" rather than as a number that appeared from
 * nowhere. Somebody who can see his own measurement in the sentence can tell
 * at a glance whether the conversion did what he expected, which is the only
 * check available to him.
 */
export function describeDimensions(
  lengthRaw: string,
  widthRaw: string,
  unitId: LengthUnitId
): string | null {
  const unit = LENGTH_UNITS.find((u) => u.id === unitId);
  if (!unit) return null;
  const l = parseAmount(lengthRaw);
  const w = parseAmount(widthRaw);
  if (l === null || w === null) return null;
  return `${l} ${unit.short} × ${w} ${unit.short}`;
}
