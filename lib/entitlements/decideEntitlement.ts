/**
 * lib/entitlements/decideEntitlement.ts — THE PURE DECISION TAIL.
 *
 * Not marked server-only, deliberately: this is a pure function of its
 * arguments — no database, no clock, no env. That is what lets
 * decideEntitlement.test.ts exercise every precedence branch (never-gated in
 * every state, no entitlement, feature not in plan, monthly cap, session
 * limit, prototype mode) without a live database, and what lets
 * lib/prototype.ts (Phase 6) produce the SAME decision from a single joined
 * query instead of paying for resolveEntitlement's three round trips on
 * every public page load.
 *
 * check.ts's can() is the only intended caller from the live request path:
 * resolve, then decide. This file owns the "decide" half.
 */
import { NEVER_GATED, type DecisionReason, type EntitlementContext, type EntitlementDecision, type FeatureKey } from './types';

export interface ResolvedEntitlement {
  planCode: string | null;
  limits: { analysisLimitPerMonth: number | null; analysisLimitPerSession: number } | null;
  features: Record<string, boolean>;
  subscriptionEntitling: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  analysesUsed: number;
  leadsCaptured: number;
  sessionAnalysesUsed: number;
}

/**
 * Fallback session limit, used ONLY when no plan row exists (an unsold
 * prototype). It is a fairness limit on anonymous visitors, not a price, so
 * it does not belong in the plans table for the unsold case. Every sold plan
 * carries analysis_limit_per_session and that value always wins.
 */
const DEFAULT_SESSION_LIMIT = 3;

export function decision(
  partial: Partial<EntitlementDecision> & { reason: DecisionReason }
): EntitlementDecision {
  return {
    allowed: partial.allowed ?? false,
    remainingMonth: partial.remainingMonth ?? null,
    remainingSession: partial.remainingSession ?? 0,
    reason: partial.reason,
    degradedMode: partial.degradedMode ?? false,
  };
}


/**
 * THE PURE DECISION TAIL (Phase 6 extraction). Everything that follows a
 * successful resolveEntitlement() call and does not touch the network — the
 * actual precedence rules documented on check.ts's can(), which now lives in
 * that file as a thin wrapper. Split out so
 * lib/prototype.ts can produce the SAME decision from a SINGLE joined query
 * (0007_admin.sql's resolve_prototype_full) instead of either duplicating
 * this logic or paying for resolveEntitlement's three separate round trips
 * on every public page load.
 *
 * Never call this with mode 'preview' — that short-circuit stays in check.ts's
 * can(), because it exists specifically to AVOID needing a `resolved` object
 * at all; a caller that already has one is never in that situation.
 */
export function decideEntitlement(
  resolved: ResolvedEntitlement,
  feature: FeatureKey,
  mode: Exclude<NonNullable<EntitlementContext['mode']>, 'preview'>
): EntitlementDecision {
  const neverGated = NEVER_GATED.includes(feature);

  const sessionLimit =
    resolved.limits?.analysisLimitPerSession ?? DEFAULT_SESSION_LIMIT;
  const remainingSession = Math.max(0, sessionLimit - resolved.sessionAnalysesUsed);

  if (mode === 'prototype') {
    if (neverGated) {
      return decision({ allowed: true, remainingMonth: null, remainingSession, reason: 'ok' });
    }
    if (remainingSession <= 0) {
      return decision({ allowed: false, remainingMonth: null, remainingSession: 0, reason: 'session_limit' });
    }
    return decision({ allowed: true, remainingMonth: null, remainingSession, reason: 'ok' });
  }

  const limit = resolved.limits?.analysisLimitPerMonth ?? null;
  const remainingMonth =
    limit === null ? null : Math.max(0, limit - resolved.analysesUsed);

  if (!resolved.subscriptionEntitling) {
    // allowed still respects neverGated (a suspended contractor's homeowner
    // can still leave contact details) — but degradedMode/reason report the
    // TRUE state unconditionally, exactly like the cap branch just below.
    // (Phase 6 fix: this previously reported reason:'ok', degradedMode:false
    // for never-gated features regardless of suspension, silently masking
    // the real state. Nothing currently calls can() with a never-gated
    // feature name, so this was latent rather than observed — caught only
    // once decideEntitlement became unit-testable in this phase's
    // extraction. See decideEntitlement.test.ts.)
    return decision({
      allowed: neverGated,
      remainingMonth,
      remainingSession,
      reason: 'subscription_suspended',
      degradedMode: true,
    });
  }

  if (neverGated) {
    const capped = limit !== null && resolved.analysesUsed >= limit;
    return decision({
      allowed: true,
      remainingMonth,
      remainingSession,
      reason: capped ? 'cap_reached' : 'ok',
      degradedMode: capped,
    });
  }

  if (resolved.features[feature] !== true) {
    return decision({ allowed: false, remainingMonth, remainingSession, reason: 'feature_not_in_plan' });
  }

  if (limit !== null && resolved.analysesUsed >= limit) {
    return decision({
      allowed: false,
      remainingMonth: 0,
      remainingSession,
      reason: 'cap_reached',
      degradedMode: true,
    });
  }

  if (remainingSession <= 0) {
    return decision({ allowed: false, remainingMonth, remainingSession: 0, reason: 'session_limit' });
  }

  return decision({ allowed: true, remainingMonth, remainingSession, reason: 'ok' });
}

