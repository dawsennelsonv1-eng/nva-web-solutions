import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolveBillingPeriod } from '@/lib/billing/period';
import {
  NEVER_GATED,
  type CanFn,
  type DecisionReason,
  type EntitlementContext,
  type EntitlementDecision,
  type EntitlementSubject,
  type FeatureKey,
  type PlanLimits,
} from '@/lib/entitlements/types';

/**
 * lib/entitlements/check.ts — THE SINGLE SERVER-SIDE DECISION POINT.
 *
 * Implements the Phase 1 CanFn contract. Every gated feature routes through
 * can() and nothing else. No call site anywhere compares a tier string
 * (SPEC R-620); if you find === 'operator' outside this file, that is the
 * defect.
 *
 * AUTHORITY: prototypes.tier and prototypes.subscription_status are a
 * denormalised cache for fast public reads (DATA_MODEL.md 2) and are NOT
 * trusted here. This module resolves the live subscription row, then reads
 * the plan's limits from the plans table — limits never appear as literals in
 * TypeScript (R-611). The hints on EntitlementSubject are accepted for
 * interface compatibility and deliberately ignored for the decision.
 *
 * FAILURE POSTURE: if the database cannot answer, we degrade rather than
 * guess. The paid AI path turns OFF (we do not spend money on an unknown
 * entitlement) and lead capture stays ON, because it is never gated at all,
 * ever. That is Product Rule 2 written as an error path.
 *
 * NO CACHING, deliberately: an entitlement read is two indexed queries, and a
 * stale cache here either bills a suspended account or blocks a contractor who
 * just paid. Correctness beats the round trip.
 */

const MODE_DEFAULT: NonNullable<EntitlementContext['mode']> = 'live';

/**
 * Fallback session limit, used ONLY when no plan row exists (an unsold
 * prototype). It is a fairness limit on anonymous visitors, not a price, so
 * it does not belong in the plans table for the unsold case. Every sold plan
 * carries analysis_limit_per_session and that value always wins.
 */
const DEFAULT_SESSION_LIMIT = 3;

/** Subscription states that entitle the paid feature set. */
const ENTITLING_STATUSES = new Set([
  'trialing',
  'active',
  'past_due', // dunning days 1-7: we do NOT break his site (Product Rule 3)
  'grace',    // the 10-day grace window: still fully live
]);

export interface ResolvedEntitlement {
  planCode: string | null;
  limits: PlanLimits | null;
  features: Record<string, boolean>;
  subscriptionEntitling: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  analysesUsed: number;
  leadsCaptured: number;
  sessionAnalysesUsed: number;
}

// The period arithmetic lives in lib/billing/period.ts, pure and unit-tested,
// so check.ts, usage.ts and Phase 5.5's dunning all derive the SAME
// usage_counters key. Re-exported here because callers already import it from
// the entitlement surface.
export { resolveBillingPeriod } from '@/lib/billing/period';

// ---------------------------------------------------------------------------
// resolution
// ---------------------------------------------------------------------------

/**
 * Reads the authoritative commercial state for one prototype. Exported so
 * Phase 5.5's billing views and Phase 3's usage writer reuse the exact same
 * period arithmetic instead of recomputing it and drifting apart.
 */
export async function resolveEntitlement(
  prototypeId: string,
  sessionId?: string
): Promise<ResolvedEntitlement> {
  const db = getSupabaseAdminClient();

  const { data: subs, error: subErr } = await db
    .from('subscriptions')
    .select('plan_code, status, current_period_start, current_period_end')
    .eq('prototype_id', prototypeId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (subErr) throw subErr;

  const sub = subs && subs.length > 0 ? subs[0] : null;

  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let analysesUsed = 0;
  let leadsCaptured = 0;

  if (sub) {
    const period: { periodStart: string; periodEnd: string } = resolveBillingPeriod(
      sub.current_period_start,
      sub.current_period_end
    );
    periodStart = period.periodStart;
    periodEnd = period.periodEnd;

    const { data: counter, error: usageErr } = await db
      .from('usage_counters')
      .select('analyses_used, leads_captured')
      .eq('prototype_id', prototypeId)
      .eq('period_start', periodStart)
      .maybeSingle();
    if (usageErr) throw usageErr;
    analysesUsed = counter ? counter.analyses_used : 0;
    leadsCaptured = counter ? counter.leads_captured : 0;
  }

  let limits: PlanLimits | null = null;
  let features: Record<string, boolean> = {};
  if (sub && sub.plan_code) {
    const { data: plan, error: planErr } = await db
      .from('plans')
      .select('analysis_limit_per_month, analysis_limit_per_session, features')
      .eq('code', sub.plan_code)
      .maybeSingle();
    if (planErr) throw planErr;
    if (plan) {
      limits = {
        analysisLimitPerMonth: plan.analysis_limit_per_month,
        analysisLimitPerSession: plan.analysis_limit_per_session,
      };
      features = (plan.features ?? {}) as Record<string, boolean>;
    }
  }

  let sessionAnalysesUsed = 0;
  if (sessionId) {
    const { data: session, error: sessErr } = await db
      .from('demo_sessions')
      .select('analyses_used_this_session')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (sessErr) throw sessErr;
    sessionAnalysesUsed = session ? session.analyses_used_this_session : 0;
  }

  return {
    planCode: sub ? sub.plan_code : null,
    limits,
    features,
    subscriptionEntitling: sub ? ENTITLING_STATUSES.has(sub.status) : false,
    periodStart,
    periodEnd,
    analysesUsed,
    leadsCaptured,
    sessionAnalysesUsed,
  };
}

// ---------------------------------------------------------------------------
// can()
// ---------------------------------------------------------------------------

function decision(
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
 * THE signature. Server-side only.
 *
 * PRECEDENCE, and the reasoning behind the order:
 *   0. mode 'preview'   admin looking at their own work. Full access, zero
 *                       writes, zero quota, no session limit.
 *      mode 'prototype' the contractor test-driving his own puppy-dog link.
 *                       Full access and NEVER consumes quota (R-124) — at
 *                       this point he has bought nothing, and the demo must
 *                       not be able to exhaust the very thing being sold. The
 *                       per-session limit STILL applies: quota exemption is
 *                       not cost exemption, and these calls are billed to us.
 *   1. never-gated      lead.capture and quote.deterministic are allowed
 *                       unconditionally in every state including cap,
 *                       suspension and outage (R-143). degradedMode still
 *                       reports the true state so the UI picks the right copy.
 *   2. no entitlement   no subscription, or suspended/canceled -> DEGRADED.
 *   3. not in plan      a real feature the tier does not include. NOT a
 *                       degraded state: nothing broke, it was not bought.
 *   4. monthly cap      DEGRADED, reason cap_reached. Checked before the
 *                       session limit so the contractor-facing upsell event
 *                       wins over the visitor-facing fairness limit.
 *   5. session limit    allowed=false but degradedMode=FALSE. The
 *                       deterministic quote still completes, so this never
 *                       becomes a persisted degraded lead — which is exactly
 *                       why session_limit is absent from the DB enum.
 */
export const can: CanFn = async (
  subject: EntitlementSubject,
  feature: FeatureKey,
  ctx?: EntitlementContext
): Promise<EntitlementDecision> => {
  const mode = ctx?.mode ?? MODE_DEFAULT;
  const neverGated = NEVER_GATED.includes(feature);

  if (mode === 'preview') {
    return decision({
      allowed: true,
      remainingMonth: null,
      remainingSession: Number.MAX_SAFE_INTEGER,
      reason: 'ok',
    });
  }

  let resolved: ResolvedEntitlement;
  try {
    resolved = await resolveEntitlement(subject.prototypeId, ctx?.sessionId);
  } catch {
    return decision({
      allowed: neverGated,
      remainingMonth: null,
      remainingSession: 0,
      reason: neverGated ? 'ok' : 'ai_unavailable',
      degradedMode: !neverGated,
    });
  }

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
    return decision({
      allowed: neverGated,
      remainingMonth,
      remainingSession,
      reason: neverGated ? 'ok' : 'subscription_suspended',
      degradedMode: !neverGated,
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
};

/**
 * One call returning both the decision inputs and the numbers the
 * contractor's usage display needs, so a page render does not resolve the
 * same state twice. Always returns BOTH numbers — analyses and leads — because
 * the cap is never shown alone (OFFER.md 2.1).
 */
export async function getUsageSnapshot(prototypeId: string) {
  const r = await resolveEntitlement(prototypeId);
  return {
    analysesUsed: r.analysesUsed,
    leadsCaptured: r.leadsCaptured,
    analysisLimitPerMonth: r.limits?.analysisLimitPerMonth ?? null,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
  };
}
