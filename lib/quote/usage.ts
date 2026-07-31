import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolveEntitlement } from '@/lib/entitlements/check';
import { trackServer } from '@/lib/analytics.server';
import type { WidgetMode, Surface } from '@/types';

/**
 * lib/quote/usage.ts — METERING. The only module that moves a counter.
 *
 * TWO COUNTERS, TWO DIFFERENT RULES, and the distinction is commercial:
 *
 *   MONTHLY (usage_counters.analyses_used) — the contractor's PAID quota.
 *   Incremented ONLY after a vision call has returned a validated analysis
 *   (SPEC R-613). A timeout, a 500 from the provider, malformed JSON, a
 *   schema failure: none of them touch this number. He bought 25 answers,
 *   not 25 attempts, and he must never pay for our bad day.
 *
 *   PER-SESSION (demo_sessions.analyses_used_this_session) — an anonymous
 *   fairness and cost guard, incremented on every ATTEMPT, before the call.
 *   If it only counted successes, a visitor sending unreadable images would
 *   get unlimited paid attempts, and the cost of those attempts lands on us,
 *   not on him. Counting attempts here is what makes the two counters
 *   independent instead of redundant.
 *
 * MODE: 'prototype' and 'preview' NEVER touch the monthly counter (R-124/5).
 * Prototype mode still consumes a session slot — quota exemption is not cost
 * exemption.
 */

export interface MeterContext {
  prototypeId: string | null;
  mode: WidgetMode;
  sessionId?: string;
  surface: Surface;
}

export interface ConsumeResult {
  analysesUsed: number;
  leadsCaptured: number;
  capReachedAt: string | null;
  /** True when THIS call was the one that reached the cap. */
  capReachedNow: boolean;
  /** True when THIS call crossed the early-warning threshold. */
  warningCrossedNow: boolean;
  limit: number | null;
}

/**
 * Reserve a session slot BEFORE the paid call. Returns false when the
 * visitor has spent their allowance, in which case the caller must not call
 * the provider at all.
 */
export async function reserveSessionAnalysis(
  sessionId: string,
  limit: number
): Promise<{ allowed: boolean; used: number }> {
  try {
    const db = getSupabaseAdminClient();
    const { data, error } = await db.rpc('increment_session_analyses', {
      p_session_id: sessionId,
      p_limit: limit,
    });
    if (error) throw error;
    const used = typeof data === 'number' ? data : 0;
    return { allowed: used <= limit && used > 0, used };
  } catch {
    // Cannot reserve: allow, and let the per-IP limiter and the daily
    // ceiling carry the load. Refusing here would break the product for
    // everyone during a transient database blip.
    return { allowed: true, used: 0 };
  }
}

/**
 * THE ATOMIC INCREMENT of the contractor's paid quota. Call this once, and
 * only once, immediately after a successful analysis.
 *
 * The arithmetic lives in the increment_usage SQL function (0002_billing),
 * which is a single INSERT..ON CONFLICT DO UPDATE — no read-then-write, so
 * concurrent homeowners on the same contractor's site cannot both read 24
 * and both write 25.
 *
 * BILLING-PERIOD ROLLOVER is handled by resolveEntitlement, which rolls the
 * subscription anchor forward when a webhook is late. Both this module and
 * check.ts derive the period from that one function, so the key they write
 * and the key they read can never disagree.
 */
export async function consumeAnalysis(ctx: MeterContext): Promise<ConsumeResult | null> {
  if (ctx.mode !== 'live' || !ctx.prototypeId) return null; // R-124/5
  const prototypeId = ctx.prototypeId;

  const resolved = await resolveEntitlement(prototypeId, ctx.sessionId);
  if (!resolved.periodStart || !resolved.periodEnd) return null; // no subscription, nothing to meter

  const limit = resolved.limits?.analysisLimitPerMonth ?? null;
  const before = resolved.analysesUsed;

  const db = getSupabaseAdminClient();
  const { data, error } = await db.rpc('increment_usage', {
    p_prototype_id: prototypeId,
    p_period_start: resolved.periodStart,
    p_period_end: resolved.periodEnd,
    p_kind: 'analysis',
    p_limit: limit,
  });
  if (error) throw error;

  const row = data as unknown as {
    analyses_used: number;
    leads_captured: number;
    cap_reached_at: string | null;
  };

  const capReachedNow = limit !== null && before < limit && row.analyses_used >= limit;

  // The early warning threshold is DERIVED from the plan's own limit (80% of
  // it — 20 of 25), never hardcoded. Changing the Foundation cap in the
  // plans table moves the warning with it, automatically.
  const warnAt = limit !== null ? Math.floor(limit * 0.8) : null;
  const warningCrossedNow =
    warnAt !== null && before < warnAt && row.analyses_used >= warnAt && row.analyses_used < limit!;

  trackServer(
    'analysis_quota_consumed',
    {
      analyses_used: row.analyses_used,
      analysis_limit: limit,
      pct_of_cap: limit === null ? null : Math.round((row.analyses_used / limit) * 100),
    },
    { surface: ctx.surface, mode: ctx.mode, sessionId: ctx.sessionId, prototypeId }
  );

  if (warningCrossedNow) {
    trackServer(
      'cap_warning_20',
      { prototype_id: prototypeId, leads_captured: row.leads_captured },
      { surface: ctx.surface, mode: ctx.mode, sessionId: ctx.sessionId, prototypeId }
    );
  }

  if (capReachedNow) {
    const daysRemaining = Math.max(
      0,
      Math.ceil((new Date(resolved.periodEnd).getTime() - Date.now()) / 86_400_000)
    );
    // Emitted ONCE, on the crossing call, because cap_reached is an upsell
    // trigger (OFFER.md) and a trigger that fires on every subsequent
    // request is a contractor being nagged, not sold to.
    trackServer(
      'cap_reached',
      {
        prototype_id: prototypeId,
        leads_captured: row.leads_captured,
        days_remaining_in_period: daysRemaining,
      },
      { surface: ctx.surface, mode: ctx.mode, sessionId: ctx.sessionId, prototypeId }
    );
  }

  return {
    analysesUsed: row.analyses_used,
    leadsCaptured: row.leads_captured,
    capReachedAt: row.cap_reached_at,
    capReachedNow,
    warningCrossedNow,
    limit,
  };
}

/**
 * The companion counter. NEVER capped, NEVER blocked, and deliberately
 * incremented through the same atomic function so the contractor's dashboard
 * always shows both numbers from one consistent row (OFFER.md 2.1:
 * "18 analyses used of 25 - 31 leads captured"). A lead arriving in degraded
 * mode increments this exactly like any other.
 */
export async function recordLeadCaptured(ctx: MeterContext): Promise<void> {
  if (ctx.mode !== 'live' || !ctx.prototypeId) return;
  try {
    const resolved = await resolveEntitlement(ctx.prototypeId);
    if (!resolved.periodStart || !resolved.periodEnd) return;
    const db = getSupabaseAdminClient();
    await db.rpc('increment_usage', {
      p_prototype_id: ctx.prototypeId,
      p_period_start: resolved.periodStart,
      p_period_end: resolved.periodEnd,
      p_kind: 'lead',
      p_limit: null,
    });
  } catch {
    // A metering failure must NEVER fail a lead write. The lead row is the
    // thing the contractor is paying for; the counter is bookkeeping.
  }
}
