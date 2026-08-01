import 'server-only';
import {
  MODEL_RATES,
  PROVIDER_DEFAULT_RATES,
  type CostRate,
  type RouteConfig,
} from './config';
import type { ProviderId, TokenUsage } from './types';

/**
 * lib/ai/pricing.ts — tokens to cents.
 *
 * EVERY number this file produces is rounded UP. A spend ceiling built on
 * optimistic arithmetic is a spend suggestion, and the whole reason this layer
 * exists is that it is the only part of the product that can spend money while
 * nobody is looking.
 */

/** Reads a cents-per-million-tokens rate from env, matching Phase 3's parser. */
export function rateCentsPerMillion(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * The rate for one call. A route may pin its own rates (vision does), in which
 * case the per-model table is bypassed entirely and cache multipliers are 1 —
 * that route does not use caching, so a multiplier there would be a number
 * that looks meaningful and is not.
 */
export function rateFor(
  provider: ProviderId,
  model: string,
  override?: RouteConfig['costRateOverride']
): CostRate {
  if (override) {
    return {
      inputCentsPerMTok: rateCentsPerMillion(
        override.inputEnv,
        override.inputDefaultCentsPerMTok
      ),
      outputCentsPerMTok: rateCentsPerMillion(
        override.outputEnv,
        override.outputDefaultCentsPerMTok
      ),
      cachedReadMultiplier: 1,
      cacheWriteMultiplier: 1,
    };
  }
  return MODEL_RATES[`${provider}:${model}`] ?? PROVIDER_DEFAULT_RATES[provider];
}

/**
 * Cost of a completed call.
 *
 * Cached reads and cache writes are priced from the SAME input rate through
 * their own multipliers, because that is how all three caching providers bill
 * it — a discount or surcharge on input, never a separate line item.
 */
export function computeCostCents(usage: TokenUsage, rate: CostRate): number {
  const cents =
    (usage.inputTokens / 1_000_000) * rate.inputCentsPerMTok +
    (usage.outputTokens / 1_000_000) * rate.outputCentsPerMTok +
    (usage.cachedInputTokens / 1_000_000) *
      rate.inputCentsPerMTok *
      rate.cachedReadMultiplier +
    (usage.cacheWriteTokens / 1_000_000) *
      rate.inputCentsPerMTok *
      rate.cacheWriteMultiplier;
  return Math.ceil(cents);
}

/**
 * WORST CASE cost of a call that has not run yet, used by the daily ceiling
 * before we commit to spending anything. Assumes every allowed output token is
 * produced, because the ceiling has to hold on the day a model decides to fill
 * its entire budget.
 */
export function estimateCostCents(args: {
  promptChars: number;
  maxOutputTokens: number;
  rate: CostRate;
  /** Repair retry doubles the input and can double the output. */
  repairEnabled: boolean;
}): number {
  const inputTokens = Math.ceil(Math.max(0, args.promptChars) / 4);
  const attempts = args.repairEnabled ? 2 : 1;
  const cents =
    ((inputTokens * attempts) / 1_000_000) * args.rate.inputCentsPerMTok +
    ((args.maxOutputTokens * attempts) / 1_000_000) * args.rate.outputCentsPerMTok;
  return Math.ceil(cents);
}

/** Cents to a string an admin can read at a glance. 7 -> "$0.07". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
