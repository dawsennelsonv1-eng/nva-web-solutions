'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getPaymentProvider, getProviderById, PaymentProviderError } from '@/lib/payments';
import { trackServer } from '@/lib/analytics.server';
import type { Tier } from '@/types';

/**
 * app/actions/billing.ts — checkout creation and the admin's manual rails.
 *
 * WHAT IS DELIBERATELY ABSENT: any action that marks a subscription active
 * from the browser. Entitlements change in exactly one place — the
 * signature-verified webhook (app/api/webhooks/stripe/route.ts). The manual
 * actions below are the single exception, and they are admin-only, explicit,
 * and recorded with provider='manual' so the audit trail shows a human did it.
 */

export interface CreateCheckoutInput {
  prospectId: string;
  prototypeId: string;
  planCode: Tier;
  entryPoint: 'self_serve' | 'admin_link';
  customerEmail?: string;
}

export type CreateCheckoutResult =
  | { ok: true; url: string; sessionRef: string }
  | { ok: false; error: string };

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? '';
}

/**
 * BOTH ENTRY POINTS PRODUCE THE SAME RESULT (phase brief): self-serve from
 * /pricing, /demo's payload screen and /s/[slug], and the admin-generated
 * link texted to a contractor mid-call. The only difference is entryPoint,
 * which rides into Stripe metadata so the analytics can tell the two apart —
 * the session, the line items and the webhook path are identical.
 */
export async function createCheckoutAction(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
  try {
    const provider = getPaymentProvider();
    const result = await provider.createCheckout({
      prospectId: input.prospectId,
      prototypeId: input.prototypeId,
      planCode: input.planCode,
      entryPoint: input.entryPoint,
      customerEmail: input.customerEmail,
      returnUrl: siteUrl() + '/checkout/return?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: siteUrl() + '/pricing?checkout=cancelled',
    });

    trackServer(
      'checkout_started',
      { plan_code: input.planCode, entry_point: input.entryPoint === 'admin_link' ? 'admin_link' : 'pricing', provider: provider.id },
      { surface: 'admin', mode: 'live', prototypeId: input.prototypeId }
    );

    return { ok: true, url: result.url, sessionRef: result.sessionRef };
  } catch (e) {
    const message =
      e instanceof PaymentProviderError
        ? e.code === 'not_configured'
          ? 'Payments are not configured yet. Set the Stripe keys and price ids first.'
          : e.message
        : 'Could not start checkout. Try again.';
    return { ok: false, error: message };
  }
}

/**
 * THE PENDING-STATE READ for /checkout/return. Returns what we currently
 * know, and nothing more. It NEVER writes, and it never grants — the page
 * polls this until the webhook lands (SPEC R-606).
 */
export async function getCheckoutStatusAction(
  prototypeId: string
): Promise<{ status: string | null; planCode: string | null }> {
  try {
    const db = getSupabaseAdminClient();
    const { data } = await db
      .from('subscriptions')
      .select('status, plan_code')
      .eq('prototype_id', prototypeId)
      .order('created_at', { ascending: false })
      .limit(1);
    const row = data?.[0];
    return { status: row?.status ?? null, planCode: row?.plan_code ?? null };
  } catch {
    return { status: null, planCode: null };
  }
}

// ---------------------------------------------------------------------------
// manual rails (admin only — /admin is gated by middleware)
// ---------------------------------------------------------------------------

export interface ManualPaymentInput {
  prospectId: string;
  prototypeId: string;
  planCode: Tier;
  kind: 'setup' | 'recurring';
  amountCents: number;
  occurredAt: string;
  note?: string;
}

/**
 * Records a payment taken outside the processor — a wire, a cheque, cash.
 * Creates or advances the subscription exactly as a webhook would, but with
 * provider='manual' so the audit trail is unambiguous about which payments a
 * human vouched for.
 */
export async function recordManualPaymentAction(
  input: ManualPaymentInput
): Promise<{ ok: boolean; error?: string }> {
  if (input.amountCents <= 0) return { ok: false, error: 'Amount must be positive.' };
  try {
    const db = getSupabaseAdminClient();
    const periodStart = new Date(input.occurredAt);
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

    const { data: existing } = await db
      .from('subscriptions')
      .select('id')
      .eq('prototype_id', input.prototypeId)
      .order('created_at', { ascending: false })
      .limit(1);

    let subscriptionId: string;
    if (existing?.[0]) {
      subscriptionId = existing[0].id;
      await db
        .from('subscriptions')
        .update({
          status: 'active',
          plan_code: input.planCode,
          provider: 'manual',
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          grace_ends_at: null,
        })
        .eq('id', subscriptionId);
    } else {
      const { data, error } = await db
        .from('subscriptions')
        .insert({
          prospect_id: input.prospectId,
          prototype_id: input.prototypeId,
          plan_code: input.planCode,
          provider: 'manual',
          status: 'active',
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
        })
        .select('id')
        .single();
      if (error || !data) return { ok: false, error: 'Could not create the subscription.' };
      subscriptionId = data.id;
    }

    await db.from('payments').insert({
      subscription_id: subscriptionId,
      provider_payment_id: null,
      kind: input.kind,
      amount_cents: input.amountCents,
      currency: 'usd',
      status: 'succeeded',
      failure_reason: input.note ?? null,
      occurred_at: input.occurredAt,
    });

    await db
      .from('prototypes')
      .update({ subscription_status: 'active', tier: input.planCode })
      .eq('id', input.prototypeId);

    // Clear any dunning history so a later failure starts a fresh timeline.
    await db.from('dunning_events').delete().eq('subscription_id', subscriptionId);

    trackServer(
      'manual_payment_recorded',
      { kind: input.kind, amount_cents: input.amountCents },
      { surface: 'admin', mode: 'live', prototypeId: input.prototypeId }
    );
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not record that payment.' };
  }
}

/**
 * Records a refund. For Stripe subscriptions this also issues the refund via
 * the provider; for manual ones the money moved outside the system and this
 * records the fact. Amount is stored NEGATIVE (DATA_MODEL.md §14) so summing
 * the payments column yields net revenue with no special case.
 */
export async function recordRefundAction(input: {
  subscriptionId: string;
  amountCents: number;
  providerPaymentId?: string | null;
  cancelSubscription?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  if (input.amountCents <= 0) return { ok: false, error: 'Refund amount must be positive.' };
  try {
    const db = getSupabaseAdminClient();
    const { data: sub } = await db
      .from('subscriptions')
      .select('id, provider, prototype_id, provider_subscription_id')
      .eq('id', input.subscriptionId)
      .maybeSingle();
    if (!sub) return { ok: false, error: 'Subscription not found.' };

    let providerRefundId: string | null = null;
    if (sub.provider === 'stripe' && input.providerPaymentId) {
      try {
        const res = await getProviderById('stripe').refund(input.providerPaymentId, input.amountCents);
        providerRefundId = res.providerRefundId;
      } catch (e) {
        return {
          ok: false,
          error: e instanceof PaymentProviderError ? e.message : 'The processor refused the refund.',
        };
      }
    }

    await db.from('payments').insert({
      subscription_id: sub.id,
      provider_payment_id: providerRefundId ?? input.providerPaymentId ?? null,
      kind: 'refund',
      amount_cents: -Math.abs(input.amountCents),
      currency: 'usd',
      status: 'refunded',
      occurred_at: new Date().toISOString(),
    });

    // OFFER.md §5: the subscription is cancelled with the refund unless he
    // asks otherwise, and no exit interview is required.
    if (input.cancelSubscription !== false) {
      await db
        .from('subscriptions')
        .update({ status: 'canceled', canceled_at: new Date().toISOString() })
        .eq('id', sub.id);
      await db
        .from('prototypes')
        .update({ subscription_status: 'canceled' })
        .eq('id', sub.prototype_id);
    }

    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not record that refund.' };
  }
}
