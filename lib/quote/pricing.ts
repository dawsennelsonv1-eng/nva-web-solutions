import { z } from 'zod';
import {
  additiveModifierLines,
  assertWithinBounds,
  finaliseQuote,
  formatCentsWhole,
  PricingError,
  type BreakdownKind,
  type BreakdownLine,
  type QuoteComputationOf,
} from '@/lib/quote/kit';

/**
 * lib/quote/pricing.ts — THE AREA x TIER PRICING KERNEL.
 *
 * THE PRICING RULE (Phase 3, absolute): the AI never produces a price. Price
 * is a pure function of contractor-owned rules in quote_configs.rules. This
 * module does no I/O, reads no env, and touches no clock or randomness — the
 * same inputs always produce the same cents. That is what makes it fully
 * unit-testable, and what makes a quote survive when the AI is down, unsure,
 * or capped.
 *
 * PHASE 11 CHANGE — read this before touching it. In Phase 3 this file WAS
 * "the engine": one formula, therefore one trade. It is now one PRICING
 * STRATEGY among several — quantity x tier rate, plus a per-unit prep rate —
 * which epoxy uses and roofing plausibly will. Painting does not: its price is
 * wall area x coat count with prep as a first-class line, so it composes its
 * own formula from lib/quote/kit.ts instead. Dispatch by vertical now lives in
 * lib/quote/price-quote.ts, which asks the MODULE to price itself. Nothing in
 * this file knows a vertical id, and nothing in it ever should.
 *
 * The shared ending (job minimum, quoted band, additive modifiers) moved to
 * kit.ts so there is exactly one implementation of it. The arithmetic is
 * unchanged to the cent; imports are still limited to zod and that pure kit.
 *
 * NO MAGIC NUMBERS: every rate, fee, bound and spread is read from `rules`. A
 * number in this file that affects a price is a defect (SPEC R-113). The only
 * literals are 0, 1 and 100 — unit arithmetic.
 *
 * ISOMORPHIC BY DESIGN: deliberately NOT server-only. The Phase 4 sqft slider
 * recomputes the range on every drag tick; a server round trip per tick is not
 * a product. The server recomputes independently before persisting, so a
 * tampered client changes what a homeowner sees for a moment and nothing that
 * gets written down.
 */

// re-exported so every Phase 3-era import path keeps working unchanged
export {
  PricingError,
  formatCentsWhole,
  type BreakdownKind,
  type BreakdownLine,
};
export type { PricingErrorCode } from '@/lib/quote/kit';

// ---------------------------------------------------------------------------
// rules — the STRUCTURAL schema the maths needs
// ---------------------------------------------------------------------------

/**
 * Two-layer validation, deliberately:
 *   1. Each vertical owns a STRICT schema with exact finish-tier keys
 *      (epoxyPricingRuleSchema: flake | metallic | solid_polyaspartic). That
 *      runs at the config boundary — when rules are saved or loaded.
 *   2. THIS schema is structural: the shape this kernel's arithmetic requires,
 *      with tier keys left open. It lets the kernel price any area x tier
 *      vertical without importing the registry, which keeps this module pure.
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

/** Unchanged shape: the Phase 3 computation, narrowed to this kernel's input. */
export type QuoteComputation = QuoteComputationOf<PricingInput>;

// ---------------------------------------------------------------------------
// the calculation
// ---------------------------------------------------------------------------

/**
 * ORDER OF OPERATIONS, and why each step sits where it does:
 *
 *   1. coating  = sqft x baseRate[finishTier]
 *   2. prep     = sqft x prepRate
 *   3. subtotal = coating + prep
 *   4. modifiers apply to the SUBTOTAL, ADDITIVELY, not compounding (kit).
 *   5. + mobilisation — a FLAT fee, added AFTER the percentages. Condition
 *      modifiers describe the floor, not the drive.
 *   6. midpoint = max(total, minimumJobCents) (kit).
 *   7. low/high = midpoint x (1 -/+ spread), low clamped to the minimum (kit).
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

  assertWithinBounds(
    input.sqft,
    input.sqftMin,
    input.sqftMax,
    'sqft_out_of_bounds',
    'sqft'
  );

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

  // 4 — modifiers, additive on the subtotal, unknown ids fail loudly
  const mods = additiveModifierLines(
    subtotalCents,
    input.conditionModifierIds,
    rules.conditionModifiers
  );
  lines.push(...mods.lines);

  // 5 — flat mobilisation, after the percentages
  if (rules.mobilizationFeeCents > 0) {
    lines.push({
      id: 'mobilization',
      label: 'Mobilisation',
      kind: 'mobilization',
      cents: rules.mobilizationFeeCents,
    });
  }

  // 6 & 7 — minimum, then the band
  return finaliseQuote<PricingInput>({
    lines,
    minimumJobCents: rules.minimumJobCents,
    rangeSpreadPct: rules.rangeSpreadPct,
    modifiersApplied: mods.applied,
    inputs: { ...input, sqft },
  });
}

/**
 * The same function under the name that describes the STRATEGY rather than the
 * era. New code (and vertical modules) should import this name; `calculateQuote`
 * stays exported for every Phase 3-10 call site.
 */
export const areaTierQuote = calculateQuote;

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
