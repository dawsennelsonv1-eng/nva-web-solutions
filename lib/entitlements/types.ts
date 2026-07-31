import type { SubscriptionStatus, Tier } from '@/types';

/**
 * THE ENTITLEMENT CONTRACT (Phase 1). Implementation arrives in Phase 3/5.5
 * as lib/entitlements/check.ts — but the contract exists from the first
 * commit so nothing anywhere gets built assuming unlimited access.
 *
 * The two rules every consumer inherits by importing these types:
 *  - Every decision is made SERVER-SIDE (SPEC R-012). A client-side check is
 *    presentation only.
 *  - No call site compares a tier string directly (SPEC R-620). If you are
 *    writing `tier === 'operator'` anywhere outside check.ts, stop.
 */

// ---------------------------------------------------------------------------
// features — the OFFER.md 1.1 entitlement matrix, machine-readable
// ---------------------------------------------------------------------------

export const FEATURE_KEYS = [
  'quote.deterministic',
  'quote.ai_analysis',
  'lead.capture',
  'quote.share_page',
  'brand.style_toggle',
  'cure.advisor',
  'command_center',
  'ai.implementation_review',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/**
 * lead.capture is listed ONLY so no future phase can mistake its absence for
 * permission to gate it. It is never gated: not at the cap, not on suspension,
 * not on AI failure (OFFER.md 1.1, SPEC R-143). check.ts must return
 * allowed=true for it unconditionally.
 */
export const NEVER_GATED: readonly FeatureKey[] = ['lead.capture', 'quote.deterministic'];

// ---------------------------------------------------------------------------
// decision shape
// ---------------------------------------------------------------------------

/**
 * Runtime decision reasons. Superset of the DB lead enum: 'session_limit'
 * degrades the *analysis* experience but the deterministic quote still
 * completes, so it never appears on a persisted lead (types/index.ts
 * DbDegradedReason). 'feature_not_in_plan' covers Operator-only features
 * viewed from Foundation (e.g. the cure advisor's locked preview).
 */
export type DecisionReason =
  | 'ok'
  | 'cap_reached'
  | 'session_limit'
  | 'subscription_suspended'
  | 'ai_unavailable'
  | 'feature_not_in_plan';

export interface EntitlementDecision {
  allowed: boolean;
  /** Analyses left this billing period. null = unlimited plan. */
  remainingMonth: number | null;
  /** Analyses left in this visitor session (both tiers; fairness limit). */
  remainingSession: number;
  reason: DecisionReason;
  /**
   * true → render the Phase 4 degraded flow: instant price OFF, lead capture
   * ON, contractor's phone prominent, and NOTHING billing-shaped shown to a
   * homeowner (SPEC R-146).
   */
  degradedMode: boolean;
}

// ---------------------------------------------------------------------------
// subject + signature
// ---------------------------------------------------------------------------

/** What check.ts needs to know about the prototype making the request. */
export interface EntitlementSubject {
  prototypeId: string;
  tier: Tier | null;
  subscriptionStatus: SubscriptionStatus | null;
}

export interface EntitlementContext {
  /** Anonymous visitor session — enforces the per-session analysis limit. */
  sessionId?: string;
  /**
   * Widget mode. 'prototype' and 'preview' NEVER consume quota (SPEC R-124/5)
   * — check.ts short-circuits them to allowed without touching counters.
   */
  mode?: 'live' | 'prototype' | 'preview';
}

/**
 * THE single signature. Server-side only. Phase 3 implements it in
 * lib/entitlements/check.ts; every gated feature in the codebase routes
 * through it and nothing else (docs/ENTITLEMENTS.md in Phase 5.5 proves it
 * call-site by call-site).
 */
export type CanFn = (
  subject: EntitlementSubject,
  feature: FeatureKey,
  ctx?: EntitlementContext
) => Promise<EntitlementDecision>;

/** Numeric limits as resolved from the plans table — never hardcoded. */
export interface PlanLimits {
  analysisLimitPerMonth: number | null;
  analysisLimitPerSession: number;
}
