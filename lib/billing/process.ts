import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { trackServer } from '@/lib/analytics.server';
import type { NormalizedEvent, NormalizedSubscriptionStatus } from '@/lib/payments';
import type { SubscriptionUpdate } from '@/types/database';
import type { Tier } from '@/types';

/**
 * lib/billing/process.ts — applies a VERIFIED, normalised webhook event to
 * our own state. Called only by app/api/webhooks/stripe/route.ts, after the
 * signature has been checked and the event recorded.
 *
 * THE ONE RULE THIS FILE IMPLEMENTS: a signature-verified webhook is the only
 * thing in the entire system permitted to change a subscription status or
 * grant an entitlement (money rule #3, SPEC R-606). Nothing here is reachable
 * from a page, a client action, or a redirect.
 *
 * Every handler is IDEMPOTENT. Stripe will re-deliver, and the route's
 * unique-constraint guard catches exact duplicates — but a retried delivery
 * after a partial failure can legitimately re-run a handler, so re-running
 * one must produce the same end state rather than a second payment row.
 */

export type ProcessResult = { ok: true; note: string } | { ok: false; error: string };

/**
 * Statuses that our own dunning clock owns and Stripe cannot see. Stripe
 * keeps saying `past_due` for the entire ten-day window; if a late
 * `customer.subscription.updated` carrying `past_due` were allowed to
 * overwrite a subscription we had already advanced to `grace` or
 * `suspended`, the dunning clock would silently reset and the contractor
 * would sit in day-1 messaging forever.
 */
const LOCALLY_ADVANCED: NormalizedSubscriptionStatus[] = ['grace', 'suspended'];

interface SubRow {
  id: string;
  prototype_id: string;
  prospect_id: string;
  status: NormalizedSubscriptionStatus;
  plan_code: string;
  current_period_start: string;
  current_period_end: string;
  last_provider_event_at: string | null;
}

async function findSubscription(event: NormalizedEvent): Promise<SubRow | null> {
  const db = getSupabaseAdminClient();
  const cols =
    'id, prototype_id, prospect_id, status, plan_code, current_period_start, current_period_end, last_provider_event_at';

  if (event.providerSubscriptionId) {
    const { data } = await db
      .from('subscriptions')
      .select(cols)
      .eq('provider_subscription_id', event.providerSubscriptionId)
      .maybeSingle();
    if (data) return data as unknown as SubRow;
  }
  if (event.prototypeId) {
    const { data } = await db
      .from('subscriptions')
      .select(cols)
      .eq('prototype_id', event.prototypeId)
      .order('created_at', { ascending: false })
      .limit(1);
    const row = data?.[0];
    if (row) return row as unknown as SubRow;
  }
  return null;
}

/**
 * Mirrors status onto prototypes for fast public reads. DATA_MODEL.md §2 is
 * explicit that this column is a cache and never authoritative —
 * lib/entitlements/check.ts always resolves the real answer from
 * subscriptions. Written only from here, the webhook path.
 */
async function mirrorToPrototype(prototypeId: string, status: string, tier: string | null) {
  const db = getSupabaseAdminClient();
  await db
    .from('prototypes')
    .update(tier ? { subscription_status: status, tier } : { subscription_status: status })
    .eq('id', prototypeId);
}

/**
 * Records a payment idempotently. provider_payment_id is the natural key; a
 * re-delivered event must not produce a second row, or MRR and refund
 * reporting drift permanently.
 */
async function recordPayment(args: {
  subscriptionId: string;
  providerPaymentId: string | null;
  kind: 'setup' | 'recurring' | 'refund';
  amountCents: number;
  currency: string;
  status: 'succeeded' | 'failed' | 'refunded';
  occurredAt: string;
  failureReason?: string | null;
}): Promise<void> {
  const db = getSupabaseAdminClient();
  if (args.providerPaymentId) {
    const { data: existing } = await db
      .from('payments')
      .select('id')
      .eq('provider_payment_id', args.providerPaymentId)
      .eq('kind', args.kind)
      .maybeSingle();
    if (existing) return;
  }
  await db.from('payments').insert({
    subscription_id: args.subscriptionId,
    provider_payment_id: args.providerPaymentId,
    kind: args.kind,
    amount_cents: args.amountCents,
    currency: args.currency,
    status: args.status,
    failure_reason: args.failureReason ?? null,
    occurred_at: args.occurredAt,
  });
}

/**
 * Applies a status change subject to BOTH guards:
 *   1. out-of-order — an event older than the last applied one is ignored
 *   2. locally-advanced — Stripe's past_due never rewinds our grace/suspended
 * Returns whether the change was actually applied.
 */
async function applyStatus(
  sub: SubRow,
  next: NormalizedSubscriptionStatus,
  event: NormalizedEvent,
  extra: SubscriptionUpdate = {}
): Promise<boolean> {
  const db = getSupabaseAdminClient();

  if (sub.last_provider_event_at && event.occurredAt <= sub.last_provider_event_at) {
    return false; // guard 1
  }
  if (next === 'past_due' && LOCALLY_ADVANCED.includes(sub.status)) {
    // guard 2 — still stamp the event time so genuinely newer events flow.
    await db
      .from('subscriptions')
      .update({ last_provider_event_at: event.occurredAt, ...extra })
      .eq('id', sub.id);
    return false;
  }

  await db
    .from('subscriptions')
    .update({ status: next, last_provider_event_at: event.occurredAt, ...extra })
    .eq('id', sub.id);
  await mirrorToPrototype(sub.prototype_id, next, event.planCode);
  return true;
}

// ---------------------------------------------------------------------------
// handlers
// ---------------------------------------------------------------------------

async function onCheckoutCompleted(event: NormalizedEvent): Promise<ProcessResult> {
  // A completed session is not a paid session. Only money moving grants
  // anything — an unpaid completion is recorded and otherwise ignored.
  if (!event.paid) {
    return { ok: true, note: 'checkout completed but unpaid; nothing granted' };
  }
  if (!event.prototypeId || !event.prospectId) {
    return { ok: false, error: 'checkout_completed missing prototype_id/prospect_id metadata' };
  }

  const db = getSupabaseAdminClient();
  const planCode: Tier = event.planCode ?? 'foundation';
  const now = new Date();
  const periodStart = event.currentPeriodStart ?? now.toISOString();
  const periodEnd =
    event.currentPeriodEnd ??
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())).toISOString();

  const existing = await findSubscription(event);

  let subscriptionId: string;
  if (existing) {
    subscriptionId = existing.id;
    await db
      .from('subscriptions')
      .update({
        status: 'active',
        plan_code: planCode,
        provider_subscription_id: event.providerSubscriptionId,
        provider_customer_id: event.providerCustomerId,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        grace_ends_at: null,
        canceled_at: null,
        last_provider_event_at: event.occurredAt,
      })
      .eq('id', existing.id);
  } else {
    const { data, error } = await db
      .from('subscriptions')
      .insert({
        prospect_id: event.prospectId,
        prototype_id: event.prototypeId,
        plan_code: planCode,
        provider: 'stripe',
        provider_customer_id: event.providerCustomerId,
        provider_subscription_id: event.providerSubscriptionId,
        status: 'active',
        current_period_start: periodStart,
        current_period_end: periodEnd,
        last_provider_event_at: event.occurredAt,
      })
      .select('id')
      .single();
    if (error || !data) return { ok: false, error: 'subscription insert failed: ' + (error?.message ?? 'unknown') };
    subscriptionId = data.id;
  }

  // The first invoice carries setup fee + first month as ONE charge (see
  // lib/payments/stripe/index.ts). Recorded as 'setup' because that is the
  // payment that opens the 30-day refund window (OFFER.md §5).
  if (event.amountCents && event.amountCents > 0) {
    await recordPayment({
      subscriptionId,
      providerPaymentId: event.providerPaymentId ?? event.sessionRef,
      kind: 'setup',
      amountCents: event.amountCents,
      currency: event.currency ?? 'usd',
      status: 'succeeded',
      occurredAt: event.occurredAt,
    });
  }

  await mirrorToPrototype(event.prototypeId, 'active', planCode);

  const { data: plan } = await db
    .from('plans')
    .select('setup_fee_cents, monthly_cents')
    .eq('code', planCode)
    .maybeSingle();

  trackServer(
    'checkout_completed',
    {
      plan_code: planCode,
      setup_cents: plan?.setup_fee_cents ?? 0,
      monthly_cents: plan?.monthly_cents ?? 0,
    },
    { surface: 'admin', mode: 'live', prototypeId: event.prototypeId }
  );

  return { ok: true, note: 'subscription active' };
}

async function onInvoicePaid(event: NormalizedEvent): Promise<ProcessResult> {
  const sub = await findSubscription(event);
  if (!sub) return { ok: false, error: 'invoice_paid for unknown subscription' };

  const wasInDunning = sub.status === 'past_due' || sub.status === 'grace' || sub.status === 'suspended';

  // Any successful payment resets the machine to active immediately
  // (OFFER.md §4 recovery). This is the ONE transition that ignores the
  // locally-advanced guard, because payment clearing genuinely supersedes
  // whatever the dunning clock believed.
  const db = getSupabaseAdminClient();
  await db
    .from('subscriptions')
    .update({
      status: 'active',
      grace_ends_at: null,
      last_provider_event_at: event.occurredAt,
      ...(event.currentPeriodStart ? { current_period_start: event.currentPeriodStart } : {}),
      ...(event.currentPeriodEnd ? { current_period_end: event.currentPeriodEnd } : {}),
    })
    .eq('id', sub.id);
  await mirrorToPrototype(sub.prototype_id, 'active', null);

  if (event.amountCents && event.amountCents > 0) {
    await recordPayment({
      subscriptionId: sub.id,
      providerPaymentId: event.providerPaymentId,
      kind: 'recurring',
      amountCents: event.amountCents,
      currency: event.currency ?? 'usd',
      status: 'succeeded',
      occurredAt: event.occurredAt,
    });
  }

  if (wasInDunning) {
    // Clear the dunning log so a future failure starts a fresh timeline
    // rather than resuming at whatever day it previously reached.
    await db.from('dunning_events').delete().eq('subscription_id', sub.id);
    trackServer(
      'payment_recovered',
      { days_in_dunning: 0 },
      { surface: 'admin', mode: 'live', prototypeId: sub.prototype_id }
    );
  }

  return { ok: true, note: wasInDunning ? 'recovered to active' : 'renewal recorded' };
}

async function onInvoiceFailed(event: NormalizedEvent): Promise<ProcessResult> {
  const sub = await findSubscription(event);
  if (!sub) return { ok: false, error: 'invoice_payment_failed for unknown subscription' };

  // Day 0. grace_ends_at is stamped now so the dunning clock has a fixed
  // origin that does not drift with when the cron happens to run.
  const graceEnds = new Date(new Date(event.occurredAt).getTime() + 10 * 86_400_000).toISOString();
  const applied = await applyStatus(sub, 'past_due', event, { grace_ends_at: graceEnds });

  await recordPayment({
    subscriptionId: sub.id,
    providerPaymentId: event.providerPaymentId,
    kind: 'recurring',
    amountCents: event.amountCents ?? 0,
    currency: event.currency ?? 'usd',
    status: 'failed',
    occurredAt: event.occurredAt,
    failureReason: event.failureReason,
  });

  const { count } = await getSupabaseAdminClient()
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('subscription_id', sub.id)
    .eq('status', 'failed');

  trackServer(
    'payment_failed',
    { attempt: count ?? 1, failure_reason: event.failureReason ?? 'unknown' },
    { surface: 'admin', mode: 'live', prototypeId: sub.prototype_id }
  );

  return { ok: true, note: applied ? 'moved to past_due, dunning armed' : 'already in a later dunning state' };
}

async function onSubscriptionUpdated(event: NormalizedEvent): Promise<ProcessResult> {
  const sub = await findSubscription(event);
  if (!sub) return { ok: false, error: 'subscription_updated for unknown subscription' };
  if (!event.status) return { ok: true, note: 'no status on event; ignored' };

  const applied = await applyStatus(sub, event.status, event, {
    ...(event.currentPeriodStart ? { current_period_start: event.currentPeriodStart } : {}),
    ...(event.currentPeriodEnd ? { current_period_end: event.currentPeriodEnd } : {}),
  });

  if (applied && event.status === 'suspended') {
    trackServer(
      'subscription_suspended',
      { days_in_dunning: 10 },
      { surface: 'admin', mode: 'live', prototypeId: sub.prototype_id }
    );
  }

  return {
    ok: true,
    note: applied ? 'status -> ' + event.status : 'ignored (out of order or locally advanced)',
  };
}

async function onSubscriptionDeleted(event: NormalizedEvent): Promise<ProcessResult> {
  const sub = await findSubscription(event);
  if (!sub) return { ok: false, error: 'subscription_deleted for unknown subscription' };

  const db = getSupabaseAdminClient();
  await db
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: event.occurredAt,
      last_provider_event_at: event.occurredAt,
    })
    .eq('id', sub.id);
  await mirrorToPrototype(sub.prototype_id, 'canceled', null);

  const daysActive = Math.max(
    0,
    Math.round((new Date(event.occurredAt).getTime() - new Date(sub.current_period_start).getTime()) / 86_400_000)
  );
  trackServer(
    'subscription_canceled',
    { reason: 'provider_deleted', days_active: daysActive },
    { surface: 'admin', mode: 'live', prototypeId: sub.prototype_id }
  );

  return { ok: true, note: 'canceled' };
}

async function onChargeRefunded(event: NormalizedEvent): Promise<ProcessResult> {
  const sub = await findSubscription(event);
  if (!sub) return { ok: false, error: 'charge_refunded for unknown subscription' };
  if (!event.amountCents || event.amountCents >= 0) {
    return { ok: true, note: 'refund event with no negative amount; ignored' };
  }

  await recordPayment({
    subscriptionId: sub.id,
    providerPaymentId: event.providerPaymentId,
    kind: 'refund',
    amountCents: event.amountCents,
    currency: event.currency ?? 'usd',
    status: 'refunded',
    occurredAt: event.occurredAt,
  });

  const db = getSupabaseAdminClient();
  const { data: setupPayment } = await db
    .from('payments')
    .select('occurred_at')
    .eq('subscription_id', sub.id)
    .eq('kind', 'setup')
    .order('occurred_at', { ascending: true })
    .limit(1);

  const setupAt = setupPayment?.[0]?.occurred_at;
  const daysSinceSetup = setupAt
    ? Math.round((new Date(event.occurredAt).getTime() - new Date(setupAt).getTime()) / 86_400_000)
    : 0;

  trackServer(
    'refund_issued',
    {
      amount_cents: Math.abs(event.amountCents),
      days_since_setup: daysSinceSetup,
      under_guarantee: daysSinceSetup <= 30,
    },
    { surface: 'admin', mode: 'live', prototypeId: sub.prototype_id }
  );

  return { ok: true, note: 'refund recorded' };
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

export async function processBillingEvent(event: NormalizedEvent): Promise<ProcessResult> {
  switch (event.kind) {
    case 'checkout_completed': return onCheckoutCompleted(event);
    case 'invoice_paid': return onInvoicePaid(event);
    case 'invoice_payment_failed': return onInvoiceFailed(event);
    case 'subscription_updated': return onSubscriptionUpdated(event);
    case 'subscription_deleted': return onSubscriptionDeleted(event);
    case 'charge_refunded': return onChargeRefunded(event);
    default:
      // Stored and acknowledged. We record every event Stripe sends and act
      // on the six we understand; an unrecognised type is not an error.
      return { ok: true, note: 'event type not actioned' };
  }
}
