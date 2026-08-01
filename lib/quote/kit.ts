/**
 * lib/quote/kit.ts — THE SHARED PRICING ARITHMETIC.
 *
 * Phase 11 extraction. Everything here is trade-agnostic: line items, the
 * additive-modifier rule, the job minimum, the quoted band, and the error
 * type. Epoxy's area x tier maths and painting's area x coats + prep maths
 * are DIFFERENT formulas that both finish the same way — this file is that
 * shared ending, so there is exactly one implementation of "sum, floor at the
 * minimum, draw the band" in the codebase.
 *
 * ZERO IMPORTS. No zod, no I/O, no env, no clock, no randomness. Same inputs,
 * same cents, on the server or mid-drag on the Phase 4 slider.
 *
 * NO MAGIC NUMBERS: nothing here invents a rate. Every figure arrives as an
 * argument, sourced from quote_configs.rules (SPEC R-113). The only literals
 * are 0 and 1 — unit arithmetic.
 */

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

export type PricingErrorCode =
  | 'invalid_rules'
  | 'invalid_inputs'
  | 'unknown_vertical'
  | 'sqft_out_of_bounds'
  | 'quantity_out_of_bounds'
  | 'unknown_finish_tier'
  | 'unknown_modifier'
  | 'invalid_bounds';

export class PricingError extends Error {
  readonly code: PricingErrorCode;
  constructor(code: PricingErrorCode, message: string) {
    super(message);
    this.name = 'PricingError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// line items
// ---------------------------------------------------------------------------

/**
 * Deliberately UNCHANGED from Phase 3. Painting expresses coats and prep
 * detail inside `detail` and `label`, not as new kinds — so any existing
 * exhaustive switch on this union keeps compiling. Widening it is a Batch 2
 * decision, made with the renderer in front of me, not a guess made now.
 */
export type BreakdownKind =
  | 'coating'
  | 'prep'
  | 'modifier'
  | 'mobilization'
  | 'minimum_adjustment';

export type BreakdownDetail =
  | { sqft: number; rateCentsPerSqft: number }
  | { pctAdjust: number }
  | { quantity: number; unitLabel: string; rateCents: number; coats?: number };

export interface BreakdownLine {
  id: string;
  label: string;
  kind: BreakdownKind;
  /** Signed integer cents. Modifiers may be negative. */
  cents: number;
  /** On per-unit lines so the UI can show "480 sq ft x $5.50". */
  detail?: BreakdownDetail;
}

/**
 * Generic over its input echo so each vertical's ResultRenderer is type-checked
 * against its OWN inputs. Phase 3 shipped this with `inputs: PricingInput`
 * hard-wired; lib/quote/pricing.ts re-narrows it to exactly that, so no
 * existing caller sees a change.
 */
export interface QuoteComputationOf<TInputs> {
  lowCents: number;
  midpointCents: number;
  highCents: number;
  /** Itemised, in display order. Sums to midpointCents exactly. */
  lines: BreakdownLine[];
  /** Ids of the modifiers that actually applied. */
  modifiersApplied: string[];
  /** True when minimumJobCents raised the price above the computed total. */
  minimumApplied: boolean;
  rangeSpreadPct: number;
  /** Echo of the priced inputs, for persistence in quotes.inputs. */
  inputs: TInputs;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export interface ModifierDefinition {
  id: string;
  label: string;
  /** 0.18 = +18%. Bounded by the caller's schema so a typo cannot 100x a quote. */
  pctAdjust: number;
}

export function sumLines(lines: BreakdownLine[]): number {
  return lines.reduce((sum, l) => sum + l.cents, 0);
}

/**
 * Modifiers apply to the SUBTOTAL, ADDITIVELY, never compounding. Three +20%
 * modifiers give +60%, not x1.728. A contractor pricing a hard job thinks
 * "twenty for the oil, twelve for the cracks" and adds them up; compounding
 * would silently overprice the worst jobs, which are exactly the ones he most
 * wants to win.
 *
 * An unknown id is an ERROR, never ignored: a typo that silently priced a
 * heavy-oil floor as clean is the one bug that costs real money on a real job.
 * AI-derived ids are filtered against the config BEFORE they get here — see
 * VisionModule.allowancesFromRules — so a confused vision call degrades the
 * quote, it never breaks it.
 */
export function additiveModifierLines(
  subtotalCents: number,
  requestedIds: string[] | undefined,
  defined: ModifierDefinition[]
): { lines: BreakdownLine[]; applied: string[] } {
  const lines: BreakdownLine[] = [];
  const applied: string[] = [];
  for (const id of requestedIds ?? []) {
    const mod = defined.find((m) => m.id === id);
    if (!mod) {
      throw new PricingError(
        'unknown_modifier',
        "condition modifier '" + id + "' is not defined in this quote_config"
      );
    }
    if (applied.includes(id)) continue; // same id twice counts once
    applied.push(id);
    lines.push({
      id: 'modifier:' + mod.id,
      label: mod.label,
      kind: 'modifier',
      cents: Math.round(subtotalCents * mod.pctAdjust),
      detail: { pctAdjust: mod.pctAdjust },
    });
  }
  return { lines, applied };
}

/**
 * The shared ending, identical for every vertical:
 *   1. midpoint = max(sum of lines, minimumJobCents) — the minimum floors the
 *      WHOLE job, applied before the band is drawn.
 *   2. low/high = midpoint x (1 -/+ spread), then low is clamped to the
 *      minimum again. Without that clamp a small job quotes a low end BELOW
 *      the number the contractor just said he will never go under.
 *
 * Byte-for-byte the Phase 3 arithmetic. Epoxy quotes must not move by a cent.
 */
export function finaliseQuote<TInputs>(args: {
  lines: BreakdownLine[];
  minimumJobCents: number;
  rangeSpreadPct: number;
  modifiersApplied: string[];
  inputs: TInputs;
}): QuoteComputationOf<TInputs> {
  const lines = [...args.lines];
  const computedTotalCents = sumLines(lines);

  let midpointCents = computedTotalCents;
  let minimumApplied = false;
  if (computedTotalCents < args.minimumJobCents) {
    minimumApplied = true;
    lines.push({
      id: 'minimum_adjustment',
      label: 'Minimum job value',
      kind: 'minimum_adjustment',
      cents: args.minimumJobCents - computedTotalCents,
    });
    midpointCents = args.minimumJobCents;
  }

  const spread = args.rangeSpreadPct;
  let lowCents = Math.round(midpointCents * (1 - spread));
  const highCents = Math.round(midpointCents * (1 + spread));
  if (lowCents < args.minimumJobCents) lowCents = args.minimumJobCents;

  return {
    lowCents,
    midpointCents,
    highCents,
    lines,
    modifiersApplied: args.modifiersApplied,
    minimumApplied,
    rangeSpreadPct: spread,
    inputs: args.inputs,
  };
}

/** Guard a homeowner-entered quantity against the config's bounds. */
export function assertWithinBounds(
  value: number,
  min: number,
  max: number,
  code: 'sqft_out_of_bounds' | 'quantity_out_of_bounds',
  unitLabel: string
): void {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    throw new PricingError(
      'invalid_bounds',
      unitLabel + ' bounds are incoherent: min=' + min + ' max=' + max
    );
  }
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new PricingError(
      code,
      unitLabel + ' ' + value + ' is outside the configured range ' + min + '-' + max
    );
  }
}

/** Whole-dollar display string for integer cents. */
export function formatCentsWhole(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}
