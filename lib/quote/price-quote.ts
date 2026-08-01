import { ensureVerticalsRegistered } from '@/lib/verticals/manifest';
import { getVertical } from '@/lib/verticals/registry';
import type { VisionContext } from '@/lib/verticals/registry';
import { PricingError, type QuoteComputationOf } from '@/lib/quote/kit';

/**
 * lib/quote/price-quote.ts — THE VERTICAL-AWARE ENTRY POINT.
 *
 * The one place that turns a vertical id into a price. It resolves the module
 * and asks the module to price itself; it contains no formula and no trade
 * knowledge, so adding roofing changes nothing here.
 *
 * Still pure and isomorphic: no fetch, no env, no clock. Safe on the Phase 4
 * slider and safe in the API route that recomputes before persisting.
 *
 * QUOTA IS NOT HANDLED HERE, on purpose. Pricing is free and unlimited — the
 * counted unit is ONE AI PHOTO ANALYSIS, counted by core at the vision call.
 * Re-quotes, slider drags and finish swaps route through this function and
 * must never touch a counter.
 */

export function priceQuote(args: {
  verticalId: string;
  rawInputs: unknown;
  rawRules: unknown;
}): QuoteComputationOf<unknown> {
  ensureVerticalsRegistered();

  let mod;
  try {
    mod = getVertical(args.verticalId);
  } catch {
    throw new PricingError(
      'unknown_vertical',
      "no vertical module registered for '" + args.verticalId + "'"
    );
  }

  const rules = mod.pricingRuleSchema.safeParse(args.rawRules);
  if (!rules.success) {
    throw new PricingError(
      'invalid_rules',
      "quote_config.rules failed validation for vertical '" + args.verticalId + "': " +
        rules.error.issues
          .map((i) => i.path.join('.') + ': ' + i.message)
          .join('; ')
    );
  }

  const inputs = mod.inputSchema.safeParse(args.rawInputs);
  if (!inputs.success) {
    throw new PricingError(
      'invalid_inputs',
      "quote inputs failed validation for vertical '" + args.verticalId + "': " +
        inputs.error.issues
          .map((i) => i.path.join('.') + ': ' + i.message)
          .join('; ')
    );
  }

  return mod.price(inputs.data, rules.data);
}

/**
 * Fold a vision result into pricing inputs. NEVER THROWS — that is the whole
 * point. Unparseable JSON, a low-confidence read, a model that returned prose,
 * a capped account with no result at all: every path returns the vertical's
 * declared fallback, and the homeowner still gets a quote from their own
 * answers. Degrade the feature, never the page.
 *
 * Pass `rawVision: null` for "no analysis happened" — capped, disabled, or a
 * prototype/preview session that must consume zero quota.
 */
export function mapVisionToInputs(args: {
  verticalId: string;
  rawVision: unknown | null;
  rawRules: unknown;
  ctx: VisionContext;
}): { inputs: Record<string, unknown>; degraded: boolean; reason?: string } {
  ensureVerticalsRegistered();

  let mod;
  try {
    mod = getVertical(args.verticalId);
  } catch {
    return { inputs: {}, degraded: true, reason: 'unknown_vertical' };
  }

  const fallback = () => {
    try {
      return mod!.vision.fallbackInputs(args.ctx) as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  if (args.rawVision === null || args.rawVision === undefined) {
    return { inputs: fallback(), degraded: true, reason: 'no_analysis' };
  }

  const rules = mod.pricingRuleSchema.safeParse(args.rawRules);
  if (!rules.success) {
    return { inputs: fallback(), degraded: true, reason: 'invalid_rules' };
  }

  const parsed = mod.vision.responseSchema.safeParse(args.rawVision);
  if (!parsed.success) {
    return { inputs: fallback(), degraded: true, reason: 'unparseable_vision' };
  }

  try {
    const allowed = mod.vision.allowancesFromRules(rules.data);
    const mapped = mod.vision.mapToInputs(
      parsed.data,
      args.ctx,
      allowed
    ) as Record<string, unknown>;
    const empty = Object.keys(mapped).length === 0;
    return {
      inputs: empty ? fallback() : mapped,
      degraded: empty,
      reason: empty ? 'low_confidence' : undefined,
    };
  } catch {
    return { inputs: fallback(), degraded: true, reason: 'mapping_failed' };
  }
}

/** The prompt for a vertical, given what the homeowner has answered so far. */
export function buildVisionPrompt(verticalId: string, ctx: VisionContext): string {
  ensureVerticalsRegistered();
  return getVertical(verticalId).vision.buildPrompt(ctx);
}
