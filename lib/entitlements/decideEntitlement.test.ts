import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideEntitlement, type ResolvedEntitlement } from './decideEntitlement';

/**
 * lib/entitlements/check.test.ts — Phase 6.
 *
 * decideEntitlement() is the single most consequential function in this
 * codebase — every gated feature in the product routes through its
 * precedence rules — and until this phase's extraction (splitting the pure
 * decision tail out of can()'s I/O) it was untestable without a live
 * database. These tests walk every branch documented in the comment above
 * can(): never-gated in every state, no entitlement, feature not in plan,
 * monthly cap, session limit, and prototype mode — the exact order matters
 * as much as the individual outcomes.
 */

const FOUNDATION_ACTIVE: ResolvedEntitlement = {
  planCode: 'foundation',
  limits: { analysisLimitPerMonth: 25, analysisLimitPerSession: 3 },
  features: {
    'quote.deterministic': true,
    'quote.ai_analysis': true,
    'lead.capture': true,
    'quote.share_page': true,
    'brand.style_toggle': true,
    'cure.advisor': false,
    command_center: false,
    'ai.implementation_review': false,
  },
  subscriptionEntitling: true,
  periodStart: '2026-07-14T00:00:00Z',
  periodEnd: '2026-08-14T00:00:00Z',
  analysesUsed: 10,
  leadsCaptured: 20,
  sessionAnalysesUsed: 0,
};

function withUsage(analysesUsed: number): ResolvedEntitlement {
  return { ...FOUNDATION_ACTIVE, analysesUsed };
}

// ---------------------------------------------------------------------------
// 1. never-gated, in every state
// ---------------------------------------------------------------------------

test('lead.capture is allowed on an active, healthy subscription', () => {
  const d = decideEntitlement(FOUNDATION_ACTIVE, 'lead.capture', 'live');
  assert.equal(d.allowed, true);
  assert.equal(d.degradedMode, false);
});

test('lead.capture is allowed even at the cap, and reports degraded truthfully', () => {
  const d = decideEntitlement(withUsage(25), 'lead.capture', 'live');
  assert.equal(d.allowed, true, 'never-gated means never blocked, not even at the cap');
  assert.equal(d.degradedMode, true, 'but the UI still needs to know the true state');
  assert.equal(d.reason, 'cap_reached');
});

test('lead.capture is allowed when the subscription is suspended', () => {
  const suspended: ResolvedEntitlement = { ...FOUNDATION_ACTIVE, subscriptionEntitling: false };
  const d = decideEntitlement(suspended, 'lead.capture', 'live');
  assert.equal(d.allowed, true);
  assert.equal(d.degradedMode, true);
  assert.equal(d.reason, 'subscription_suspended');
});

test('quote.deterministic is allowed under every condition tested for lead.capture', () => {
  for (const [resolved, label] of [
    [FOUNDATION_ACTIVE, 'healthy'],
    [withUsage(25), 'capped'],
    [{ ...FOUNDATION_ACTIVE, subscriptionEntitling: false }, 'suspended'],
  ] as const) {
    const d = decideEntitlement(resolved, 'quote.deterministic', 'live');
    assert.equal(d.allowed, true, label);
  }
});

// ---------------------------------------------------------------------------
// 2. no entitlement (suspended / canceled)
// ---------------------------------------------------------------------------

test('a gated feature is blocked and degraded when the subscription does not entitle', () => {
  const suspended: ResolvedEntitlement = { ...FOUNDATION_ACTIVE, subscriptionEntitling: false };
  const d = decideEntitlement(suspended, 'quote.ai_analysis', 'live');
  assert.equal(d.allowed, false);
  assert.equal(d.degradedMode, true);
  assert.equal(d.reason, 'subscription_suspended');
});

// ---------------------------------------------------------------------------
// 3. feature not in plan — NOT degraded
// ---------------------------------------------------------------------------

test('a feature the tier does not include is blocked but NOT degraded', () => {
  const d = decideEntitlement(FOUNDATION_ACTIVE, 'cure.advisor', 'live');
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'feature_not_in_plan');
  assert.equal(d.degradedMode, false, 'nothing broke — it was never bought');
});

test('the same feature is allowed on Operator', () => {
  const operator: ResolvedEntitlement = {
    ...FOUNDATION_ACTIVE,
    planCode: 'operator',
    limits: { analysisLimitPerMonth: null, analysisLimitPerSession: 3 },
    features: { ...FOUNDATION_ACTIVE.features, 'cure.advisor': true },
  };
  const d = decideEntitlement(operator, 'cure.advisor', 'live');
  assert.equal(d.allowed, true);
});

// ---------------------------------------------------------------------------
// 4. monthly cap — precedence over session limit
// ---------------------------------------------------------------------------

test('the monthly cap blocks and degrades once usage reaches the limit', () => {
  const d = decideEntitlement(withUsage(25), 'quote.ai_analysis', 'live');
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'cap_reached');
  assert.equal(d.degradedMode, true);
  assert.equal(d.remainingMonth, 0);
});

test('cap_reached wins over session_limit when both would otherwise apply', () => {
  const bothExhausted: ResolvedEntitlement = { ...withUsage(25), sessionAnalysesUsed: 3 };
  const d = decideEntitlement(bothExhausted, 'quote.ai_analysis', 'live');
  assert.equal(
    d.reason,
    'cap_reached',
    'the contractor-facing upsell trigger must win over the visitor fairness limit'
  );
});

test('unlimited plans (null monthly limit) never reach cap_reached', () => {
  const unlimited: ResolvedEntitlement = {
    ...FOUNDATION_ACTIVE,
    planCode: 'operator',
    limits: { analysisLimitPerMonth: null, analysisLimitPerSession: 3 },
    analysesUsed: 500,
  };
  const d = decideEntitlement(unlimited, 'quote.ai_analysis', 'live');
  assert.equal(d.allowed, true);
  assert.equal(d.remainingMonth, null);
});

// ---------------------------------------------------------------------------
// 5. session limit — allowed=false, degradedMode=FALSE, always
// ---------------------------------------------------------------------------

test('the per-session limit blocks WITHOUT entering degraded mode', () => {
  const sessionCapped: ResolvedEntitlement = { ...FOUNDATION_ACTIVE, sessionAnalysesUsed: 3 };
  const d = decideEntitlement(sessionCapped, 'quote.ai_analysis', 'live');
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'session_limit');
  assert.equal(d.degradedMode, false, 'the deterministic quote still completes — this is not degraded');
});

test('a sold plan\u2019s own session limit is honoured, not a hardcoded default', () => {
  const wideSession: ResolvedEntitlement = {
    ...FOUNDATION_ACTIVE,
    limits: { analysisLimitPerMonth: 25, analysisLimitPerSession: 10 },
    sessionAnalysesUsed: 5,
  };
  const d = decideEntitlement(wideSession, 'quote.ai_analysis', 'live');
  assert.equal(d.allowed, true);
  assert.equal(d.remainingSession, 5);
});

// ---------------------------------------------------------------------------
// 6. prototype mode — quota-exempt, still session-limited
// ---------------------------------------------------------------------------

test('prototype mode never touches the monthly cap even when usage is at the limit', () => {
  const d = decideEntitlement(withUsage(25), 'quote.ai_analysis', 'prototype');
  assert.equal(d.allowed, true, 'the contractor test-driving his own link must never see it capped');
  assert.equal(d.remainingMonth, null);
});

test('prototype mode still enforces the per-session limit', () => {
  const sessionCapped: ResolvedEntitlement = { ...FOUNDATION_ACTIVE, sessionAnalysesUsed: 3 };
  const d = decideEntitlement(sessionCapped, 'quote.ai_analysis', 'prototype');
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'session_limit');
});

test('prototype mode allows lead.capture unconditionally, same as live', () => {
  const d = decideEntitlement(withUsage(25), 'lead.capture', 'prototype');
  assert.equal(d.allowed, true);
});

// ---------------------------------------------------------------------------
// 7. ordering sanity: remainingMonth/remainingSession are always coherent
// ---------------------------------------------------------------------------

test('remainingMonth never goes negative even if usage somehow exceeds the limit', () => {
  const over: ResolvedEntitlement = { ...FOUNDATION_ACTIVE, analysesUsed: 40 };
  const d = decideEntitlement(over, 'quote.ai_analysis', 'live');
  assert.equal(d.remainingMonth, 0);
});

test('remainingSession never goes negative', () => {
  const over: ResolvedEntitlement = { ...FOUNDATION_ACTIVE, sessionAnalysesUsed: 9 };
  const d = decideEntitlement(over, 'quote.ai_analysis', 'live');
  assert.equal(d.remainingSession, 0);
});
