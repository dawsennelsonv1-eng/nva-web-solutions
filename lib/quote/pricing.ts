import { z } from 'zod';

/**
 * lib/quote/pricing.ts — THE DETERMINISTIC PRICING ENGINE.
 *
 * THE PRICING RULE (Phase 3, absolute): the AI never produces a price. Price
 * is a pure function of contractor-owned rules in quote_configs.rules. This
 * module has ZERO imports beyond zod, does no I/O, reads no env, and touches
 * no clock or randomness — the same inputs always produce the same cents.
 * That is what makes it fully unit-testable, and what makes a quote survive
 * when the AI is down, unsure, or capped.
 *
 * NO MAGIC NUMBERS: every rate, fee, bound and spread is read from `rules`.
 * A number in this file that affects a price is a defect (SPEC R-113). The
 * only literals are 0, 1 and 100 — unit arithmetic.
 *
 * ISOMORPHIC BY DESIGN: deliberately NOT server-only. The Phase 4 sqft
 * slider recomputes the range on every drag tick; a server round trip per
 * tick is not a product. The server recomputes independently before
 * persisting, so a tampered client changes what a homeowner sees for a
 * moment and nothing that gets written down.
 */

// ---------------------------------------------------------------------------
// rules — the STRUCTURAL schema the maths needs
// ---------------------------------------------------------------------------

/**
 * Two-layer validation, deliberately:
 *   1. Each vertical owns a STRICT schema with exact finish-tier keys
 *      (epoxyPricingRuleSchema: flake | metallic | solid_polyaspartic). That
 *      runs at the config boundary — when rules are saved or loaded.
 *   2. THIS schema is structural: the shape the arithmetic requires, with
 *      tier keys left open. It lets the engine price any vertical without
 *      importing the registry, which keeps this module pure and keeps
 *      Phase 11 additive.
 */
export const pricingRulesSchema = z.object({
  /** tierKey -> cents per square foot. Keys are vertical-defined. */
  baseRateCentsPerSqft: z.record(z.string(), z.number().int().positive()),
  /** Surface preparation (grind, patch, clean) in cents per square foot. */
  prepRateCentsPerSqft: z.number().int().nonnegative(),
  conditionModifiers: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      /** 0.18 = +18%. Bounded so a config typo cannot 100x a quote. */
      pctAdjust: z.number().min(-0.5).max(1),
    })
  ),
  /** Floor on what the contractor will actually take the job for. */
  minimumJobCents: z.number().int().nonnegative(),
  /** Flat cost of showing up: truck, fuel, crew mobilisation. */
  mobilizationFeeCents: z.number().int().nonnegative(),
  /** Half-width of the quoted band. 0.15 -> midpoint +/-15%. */
  rangeSpreadPct: z.number().min(0.05).max(0.5),
});

export type PricingRules = z.infer<typeof pricingRulesSchema>;

// ---------------------------------------------------------------------------
// inputs & outputs
// ---------------------------------------------------------------------------

export interface PricingInput {
  /** Square footage, bounded by the quote_config's sqft_min / sqft_max. */
  sqft: number;
  /** Registry surface id. Recorded, not priced — see the note at the bottom. */
  surfaceTypeId: string;
  /** Which key of baseRateCentsPerSqft this finish resolves to. */
  finishTierKey: string;
  /** Condition modifier ids. An unknown id is an ERROR, never ignored. */
  conditionModifierIds?: string[];
  /** Slider bounds from quote_configs, enforced here so no caller can skip them. */
  sqftMin: number;
  sqftMax: number;
}

export type BreakdownKind =
  | 'coating'
  | 'prep'
  | 'modifier'
  | 'mobilization'
  | 'minimum_adjustment';

export interface BreakdownLine {
  id: string;
  label: string;
  kind: BreakdownKind;
  /** Signed integer cents. Modifiers may be negative. */
  cents: number;
  /** On per-sqft lines so the UI can show "480 sq ft x $5.50". */
  detail?: { sqft: number; rateCentsPerSqft: number } | { pctAdjust: number };
}

export interface QuoteComputation {
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
  inputs: PricingInput;
}

export type PricingErrorCode =
  | 'invalid_rules'
  | 'sqft_out_of_bounds'
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
// the calculation
// ---------------------------------------------------------------------------

/**
 * ORDER OF OPERATIONS, and why each step sits where it does:
 *
 *   1. coating  = sqft x baseRate[finishTier]
 *   2. prep     = sqft x prepRate
 *   3. subtotal = coating + prep
 *   4. modifiers apply to the SUBTOTAL, ADDITIVELY, not compounding.
 *      Three +20% modifiers give +60%, not x1.728. A contractor pricing a
 *      hard floor thinks "twenty for the oil, twelve for the cracks" and
 *      adds them up; compounding would silently overprice the worst floors,
 *      which are exactly the jobs he most wants to win.
 *   5. + mobilisation — a FLAT fee, added AFTER the percentages. Condition
 *      modifiers describe the floor, not the drive.
 *   6. midpoint = max(total, minimumJobCents) — the minimum is a floor on
 *      the whole job, applied before the band is drawn.
 *   7. low/high = midpoint x (1 -/+ spread), then low is clamped to the
 *      minimum again. Without that clamp a small job quotes a low end BELOW
 *      the number the contractor just said he will never go under.
 */
export function calculateQuote(
  input: PricingInput,
  rawRules: unknown
): QuoteComputation {
  const parsed = pricingRulesSchema.safeParse(rawRules);
  if (!parsed.success) {
    throw new PricingError(
      'invalid_rules',
      'quote_config.rules failed validation: ' +
        parsed.error.issues
          .map((i) => i.path.join('.') + ': ' + i.message)
          .join('; ')
    );
  }
  const rules = parsed.data;

  if (
    !Number.isFinite(input.sqftMin) ||
    !Number.isFinite(input.sqftMax) ||
    input.sqftMax <= input.sqftMin
  ) {
    throw new PricingError(
      'invalid_bounds',
      'sqft bounds are incoherent: min=' + input.sqftMin + ' max=' + input.sqftMax
    );
  }

  if (
    !Number.isFinite(input.sqft) ||
    input.sqft < input.sqftMin ||
    input.sqft > input.sqftMax
  ) {
    throw new PricingError(
      'sqft_out_of_bounds',
      'sqft ' + input.sqft + ' is outside the configured range ' +
        input.sqftMin + '-' + input.sqftMax
    );
  }

  const baseRate = rules.baseRateCentsPerSqft[input.finishTierKey];
  if (baseRate === undefined) {
    throw new PricingError(
      'unknown_finish_tier',
      "finish tier '" + input.finishTierKey +
        "' has no rate in this quote_config. Configured tiers: " +
        Object.keys(rules.baseRateCentsPerSqft).join(', ')
    );
  }

  const sqft = Math.round(input.sqft);
  const lines: BreakdownLine[] = [];

  // 1 & 2 — per-square-foot work
  const coatingCents = Math.round(sqft * baseRate);
  lines.push({
    id: 'coating',
    label: 'Coating material and application',
    kind: 'coating',
    cents: coatingCents,
    detail: { sqft, rateCentsPerSqft: baseRate },
  });

  const prepCents = Math.round(sqft * rules.prepRateCentsPerSqft);
  if (prepCents > 0) {
    lines.push({
      id: 'prep',
      label: 'Surface preparation',
      kind: 'prep',
      cents: prepCents,
      detail: { sqft, rateCentsPerSqft: rules.prepRateCentsPerSqft },
    });
  }

  const subtotalCents = coatingCents + prepCents;

  // 4 — modifiers, additive on the subtotal. Unknown ids fail LOUDLY: a typo
  // that silently priced a heavy-oil floor as clean is the one bug that
  // costs the contractor real money on a real job.
  const requested = input.conditionModifierIds ?? [];
  const modifiersApplied: string[] = [];
  for (const id of requested) {
    const mod = rules.conditionModifiers.find((m) => m.id === id);
    if (!mod) {
      throw new PricingError(
        'unknown_modifier',
        "condition modifier '" + id + "' is not defined in this quote_config"
      );
    }
    if (modifiersApplied.includes(id)) continue; // same id twice counts once
    modifiersApplied.push(id);
    lines.push({
      id: 'modifier:' + mod.id,
      label: mod.label,
      kind: 'modifier',
      cents: Math.round(subtotalCents * mod.pctAdjust),
      detail: { pctAdjust: mod.pctAdjust },
    });
  }

  // 5 — flat mobilisation, after the percentages
  if (rules.mobilizationFeeCents > 0) {
    lines.push({
      id: 'mobilization',
      label: 'Mobilisation',
      kind: 'mobilization',
      cents: rules.mobilizationFeeCents,
    });
  }

  const computedTotalCents = lines.reduce((sum, l) => sum + l.cents, 0);

  // 6 — job minimum
  let midpointCents = computedTotalCents;
  let minimumApplied = false;
  if (computedTotalCents < rules.minimumJobCents) {
    minimumApplied = true;
    lines.push({
      id: 'minimum_adjustment',
      label: 'Minimum job value',
      kind: 'minimum_adjustment',
      cents: rules.minimumJobCents - computedTotalCents,
    });
    midpointCents = rules.minimumJobCents;
  }

  // 7 — the band
  const spread = rules.rangeSpreadPct;
  let lowCents = Math.round(midpointCents * (1 - spread));
  const highCents = Math.round(midpointCents * (1 + spread));
  if (lowCents < rules.minimumJobCents) lowCents = rules.minimumJobCents;

  return {
    lowCents,
    midpointCents,
    highCents,
    lines,
    modifiersApplied,
    minimumApplied,
    rangeSpreadPct: spread,
    inputs: { ...input, sqft },
  };
}

/**
 * SURFACE TYPE IS RECORDED, NOT PRICED — on purpose.
 * The locked quote_config schema carries no surface-type rate: price comes
 * from finish tier and square footage. Surface type drives which "typical
 * dimensions" helper Phase 4 offers and which condition modifiers make sense
 * to show. Inventing a commercial volume discount here would put a rate in
 * TypeScript instead of in the contractor's own config, which is exactly what
 * R-113 forbids. If volume tiering is wanted, it is a rules-schema change,
 * made once, in the vertical module and the seed.
 */

/** Whole-dollar display string for integer cents. */
export function formatCentsWhole(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}
