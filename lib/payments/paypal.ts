import 'server-only';
import type { Tier } from '@/types';
import {
  PaymentProviderError,
  type CheckoutRequest,
  type CheckoutResult,
  type NormalizedEvent,
  type NormalizedEventKind,
  type NormalizedSubscription,
  type NormalizedSubscriptionStatus,
  type PaymentProvider,
  type WebhookVerification,
} from './provider';

/**
 * lib/payments/paypal.ts — the PayPal provider.
 *
 * Written to mirror lib/payments/stripe/index.ts: raw REST rather than an SDK,
 * a pinned timeout, and NO PAYPAL TYPE LEAVING THIS FILE. Everything returned
 * crosses the boundary as a normalised shape from ./provider.
 *
 * ============================================================================
 * READ THIS BEFORE TAKING A LIVE PAYMENT
 * ============================================================================
 *
 * I HAVE NEVER RUN THIS. Not once, not against sandbox. It is written from
 * PayPal's documented API surface and it typechecks, and neither of those is
 * evidence that money moves correctly.
 *
 * RUN A SANDBOX SUBSCRIPTION END TO END BEFORE POINTING REAL CUSTOMERS AT IT:
 * approve a subscription, confirm BILLING.SUBSCRIPTION.ACTIVATED arrives and
 * verifies, confirm PAYMENT.SALE.COMPLETED arrives with the right amount, and
 * confirm the row in `payments` matches what PayPal says it charged. Check the
 * setup fee specifically — see the note on createCheckout.
 *
 * ============================================================================
 * THE THREE PLACES PAYPAL DIFFERS FROM STRIPE IN A WAY THAT COSTS MONEY
 * ============================================================================
 *
 * 1. THE SETUP FEE IS ON THE PLAN, NOT THE REQUEST.
 *    Stripe puts a one-off and a recurring line in one session, so both succeed
 *    or fail atomically. PayPal has no per-request equivalent: the one-off is
 *    `payment_preferences.setup_fee` configured ON THE PLAN in PayPal's
 *    dashboard or API.
 *
 *    THIS MEANS THE $500 SETUP FEE IS NOT IN THIS CODE. If the plan you create
 *    does not carry a setup fee, every customer is charged the monthly only and
 *    nothing here will complain. There is no assertion this file can make about
 *    it — the amount lives in PayPal. VERIFY IT ON THE PLAN before selling.
 *
 * 2. AMOUNTS ARE DECIMAL STRINGS, NOT INTEGER CENTS.
 *    PayPal says "500.00"; this codebase counts in integer cents everywhere
 *    (payments.amount_cents, the pricing engine, the DB check constraints).
 *    centsFromPayPal below does that conversion through a rounded multiply
 *    rather than parseFloat arithmetic, because 0.1 + 0.2 problems in a money
 *    path are how a ledger drifts by a cent per transaction forever.
 *
 * 3. SIGNATURE VERIFICATION IS A NETWORK CALL, NOT AN HMAC.
 *    Stripe hands you a header you can verify offline. PayPal requires POSTing
 *    the event back to /v1/notifications/verify-webhook-signature with five
 *    transmission headers. That call can fail for reasons that are not forgery
 *    — a timeout, an outage — and those MUST be reported as bad_signature so
 *    PayPal retries. Reporting ok on an unverified event would grant a paid
 *    entitlement on an unauthenticated request, which is the one thing this
 *    whole abstraction exists to prevent (SPEC R-606).
 */

const TIMEOUT_MS = 20_000;

function apiBase(): string {
  const env = (process.env.PAYPAL_ENV ?? 'sandbox').trim().toLowerCase();
  return env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

function credentials(): { id: string; secret: string } {
  const id = (process.env.PAYPAL_CLIENT_ID ?? '').trim();
  const secret = (process.env.PAYPAL_CLIENT_SECRET ?? '').trim();
  if (!id || !secret) {
    throw new PaymentProviderError(
      'PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set',
      'not_configured'
    );
  }
  return { id, secret };
}

/** True when the adapter has what it needs to call PayPal at all. */
export function paypalConfigured(): boolean {
  return (
    (process.env.PAYPAL_CLIENT_ID ?? '').trim().length > 0 &&
    (process.env.PAYPAL_CLIENT_SECRET ?? '').trim().length > 0
  );
}

/**
 * OAuth2 client-credentials token.
 *
 * Deliberately NOT cached across requests. A module-level cache in a serverless
 * runtime is per-instance and unbounded in staleness, and the failure mode of a
 * stale token is a 401 in the middle of a checkout. One extra round trip per
 * payment operation is a price worth paying; payments are not a hot path.
 */
async function accessToken(): Promise<string> {
  const { id, secret } = credentials();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(apiBase() + '/v1/oauth2/token', {
      method: 'POST',
      headers: {
        authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: controller.signal,
    });
    const json = (await res.json()) as { access_token?: string; error_description?: string };
    if (!res.ok || !json.access_token) {
      throw new PaymentProviderError(
        json.error_description ?? 'paypal auth ' + res.status,
        res.status >= 500 ? 'provider_error' : 'not_configured'
      );
    }
    return json.access_token;
  } finally {
    clearTimeout(timer);
  }
}

async function paypalRequest<T>(
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>
): Promise<T> {
  const token = await accessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(apiBase() + path, {
      method,
      headers: {
        authorization: 'Bearer ' + token,
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    // 204 on cancel; there is no body to parse.
    const text = await res.text();
    const json = text.length > 0 ? (JSON.parse(text) as unknown) : {};
    if (!res.ok) {
      const msg = (json as { message?: string })?.message ?? 'paypal ' + res.status;
      throw new PaymentProviderError(msg, res.status >= 500 ? 'provider_error' : 'invalid_request');
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// mapping
// ---------------------------------------------------------------------------

/**
 * PayPal decimal string -> integer cents.
 *
 * Rounded multiply rather than parseFloat arithmetic: "19.99" * 100 in floating
 * point is 1998.9999999999998, and truncating that loses a cent on a large
 * fraction of transactions. Math.round is the whole fix and it must stay.
 */
function centsFromPayPal(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/**
 * PayPal subscription status onto ours.
 *
 * APPROVAL_PENDING and APPROVED ARE NOT ACTIVE. The payer has clicked through
 * PayPal's flow; no money has necessarily moved. Mapping either to 'active'
 * would grant an entitlement on a navigation event, which is exactly the rule
 * ./provider.ts states there is no legitimate caller for.
 *
 * 'grace' and 'suspended' beyond this are OUR states, produced by the dunning
 * clock. PayPal has no equivalent, same as Stripe.
 */
function mapStatus(status: string): NormalizedSubscriptionStatus {
  switch (status) {
    case 'ACTIVE':
      return 'active';
    case 'APPROVAL_PENDING':
    case 'APPROVED':
      return 'trialing';
    case 'SUSPENDED':
      return 'suspended';
    case 'CANCELLED':
    case 'EXPIRED':
      return 'canceled';
    default:
      return 'past_due';
  }
}

const EVENT_MAP: Record<string, NormalizedEventKind> = {
  'BILLING.SUBSCRIPTION.ACTIVATED': 'checkout_completed',
  'BILLING.SUBSCRIPTION.UPDATED': 'subscription_updated',
  'BILLING.SUBSCRIPTION.SUSPENDED': 'subscription_updated',
  'BILLING.SUBSCRIPTION.CANCELLED': 'subscription_deleted',
  'BILLING.SUBSCRIPTION.EXPIRED': 'subscription_deleted',
  'PAYMENT.SALE.COMPLETED': 'invoice_paid',
  'PAYMENT.SALE.DENIED': 'invoice_payment_failed',
  'PAYMENT.SALE.REFUNDED': 'charge_refunded',
};

/** Which plan id backs each tier. Env, so the same code runs sandbox and live. */
function paypalPlanId(planCode: Tier): string | undefined {
  return planCode === 'operator'
    ? process.env.PAYPAL_PLAN_OPERATOR
    : process.env.PAYPAL_PLAN_FOUNDATION;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * PayPal has no `metadata` object. `custom_id` is the single free-text field
 * that survives onto the subscription and its sale events, so the four facts
 * Stripe carries in metadata are packed into it as JSON.
 *
 * Kept SHORT deliberately: custom_id is capped (127 chars on subscriptions), so
 * this stores ids and the plan code and nothing else. If it ever overflows,
 * PayPal truncates silently and the webhook loses its correlation — so nothing
 * discretionary may be added here.
 */
function packCustomId(req: CheckoutRequest): string {
  return JSON.stringify({
    t: req.prototypeId,
    s: req.prospectId,
    p: req.planCode,
    e: req.entryPoint,
  });
}

function unpackCustomId(raw: unknown): {
  prototypeId: string | null;
  prospectId: string | null;
  planCode: Tier | null;
} {
  const empty = { prototypeId: null, prospectId: null, planCode: null };
  const s = str(raw);
  if (!s) return empty;
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    const p = str(o.p);
    return {
      prototypeId: str(o.t),
      prospectId: str(o.s),
      planCode: p === 'foundation' || p === 'operator' ? p : null,
    };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// the provider
// ---------------------------------------------------------------------------

export const paypalProvider: PaymentProvider = {
  id: 'paypal',

  /**
   * Creates a subscription in APPROVAL_PENDING and returns its approve link.
   *
   * THE SETUP FEE IS NOT SET HERE AND CANNOT BE. It lives on the PayPal plan
   * (payment_preferences.setup_fee). Create the plan with it, and check a
   * sandbox transaction charges setup + first month — this code has no way to
   * detect a plan that is missing it, and the symptom is silently charging
   * every customer $500 less than intended.
   *
   * sessionRef is the subscription id, which is what BILLING.SUBSCRIPTION.*
   * events carry, so the webhook can correlate back to this checkout.
   */
  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const planId = paypalPlanId(req.planCode);
    if (!planId) {
      throw new PaymentProviderError(
        'Missing PayPal plan id for plan ' + req.planCode,
        'not_configured'
      );
    }

    const body: Record<string, unknown> = {
      plan_id: planId,
      custom_id: packCustomId(req),
      application_context: {
        return_url: req.returnUrl,
        cancel_url: req.cancelUrl,
        // SUBSCRIBE_NOW so approval completes in PayPal rather than returning
        // the payer to us in a state that still needs a second confirmation.
        user_action: 'SUBSCRIBE_NOW',
        shipping_preference: 'NO_SHIPPING',
      },
    };
    if (req.customerEmail) {
      body.subscriber = { email_address: req.customerEmail };
    }

    const sub = await paypalRequest<{
      id?: string;
      links?: { rel?: string; href?: string }[];
    }>('/v1/billing/subscriptions', 'POST', body);

    const approve = (sub.links ?? []).find((l) => l.rel === 'approve')?.href;
    if (!sub.id || !approve) {
      throw new PaymentProviderError(
        'PayPal returned a subscription with no approve link',
        'provider_error'
      );
    }
    return { url: approve, sessionRef: sub.id };
  },

  async getSubscription(providerSubscriptionId: string): Promise<NormalizedSubscription | null> {
    try {
      const sub = await paypalRequest<Record<string, unknown>>(
        '/v1/billing/subscriptions/' + encodeURIComponent(providerSubscriptionId),
        'GET'
      );
      const billing = (sub.billing_info ?? {}) as Record<string, unknown>;
      const cycle = (billing.last_payment ?? {}) as Record<string, unknown>;
      const meta = unpackCustomId(sub.custom_id);
      return {
        providerSubscriptionId: str(sub.id),
        providerCustomerId: str((sub.subscriber as Record<string, unknown>)?.payer_id),
        status: mapStatus(String(sub.status ?? '')),
        currentPeriodStart: str(cycle.time) ?? str(sub.start_time) ?? new Date().toISOString(),
        currentPeriodEnd: str(billing.next_billing_time) ?? new Date().toISOString(),
        planCode: meta.planCode,
        canceledAt: sub.status === 'CANCELLED' ? (str(sub.status_update_time) ?? null) : null,
      };
    } catch {
      return null;
    }
  },

  /**
   * PayPal has no cancel_at_period_end. Cancelling is immediate.
   *
   * atPeriodEnd is therefore NOT honoured here and the caller must not assume
   * it was — scheduling a future cancellation means recording the date locally
   * and calling this on it. Silently cancelling immediately when the caller
   * asked for period-end would cut off a contractor who has paid for the rest
   * of the month.
   */
  async cancelSubscription(providerSubscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    if (atPeriodEnd) {
      throw new PaymentProviderError(
        'PayPal cannot cancel at period end. Record the date and cancel on it.',
        'invalid_request'
      );
    }
    await paypalRequest(
      '/v1/billing/subscriptions/' + encodeURIComponent(providerSubscriptionId) + '/cancel',
      'POST',
      { reason: 'cancelled by operator' }
    );
  },

  /**
   * providerPaymentId must be a CAPTURE id, not the sale id older webhook
   * payloads carry. Passing a sale id here 404s.
   */
  async refund(providerPaymentId: string, amountCents: number) {
    const amount = (Math.abs(amountCents) / 100).toFixed(2);
    const refund = await paypalRequest<{ id?: string }>(
      '/v2/payments/captures/' + encodeURIComponent(providerPaymentId) + '/refund',
      'POST',
      { amount: { value: amount, currency_code: process.env.PAYPAL_CURRENCY ?? 'USD' } }
    );
    if (!refund.id) {
      throw new PaymentProviderError('PayPal refund returned no id', 'provider_error');
    }
    return { providerRefundId: refund.id };
  },

  /**
   * `signature` carries the five PayPal transmission headers as JSON, packed by
   * app/api/webhooks/paypal/route.ts.
   *
   * That is a deliberate accommodation of the PaymentProvider contract, which
   * passes ONE signature string because Stripe uses one header. Widening the
   * interface for PayPal would have meant touching Stripe's implementation and
   * every existing caller, to carry a shape only one provider needs. The
   * packing is confined to one route and one function.
   *
   * ANY failure to verify — bad signature, malformed, a timeout on the
   * verification call — returns not-ok. PayPal retries on a non-2xx, so a
   * transient outage costs a delay, never a false grant.
   */
  async handleWebhook(rawBody: string, signature: string | null): Promise<WebhookVerification> {
    const webhookId = (process.env.PAYPAL_WEBHOOK_ID ?? '').trim();
    if (!webhookId || !paypalConfigured()) return { ok: false, reason: 'not_configured' };
    if (!signature) return { ok: false, reason: 'bad_signature' };

    let headers: Record<string, string>;
    let event: Record<string, unknown>;
    try {
      headers = JSON.parse(signature) as Record<string, string>;
      event = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { ok: false, reason: 'malformed' };
    }

    try {
      const verdict = await paypalRequest<{ verification_status?: string }>(
        '/v1/notifications/verify-webhook-signature',
        'POST',
        {
          transmission_id: headers.transmission_id,
          transmission_time: headers.transmission_time,
          cert_url: headers.cert_url,
          auth_algo: headers.auth_algo,
          transmission_sig: headers.transmission_sig,
          webhook_id: webhookId,
          webhook_event: event,
        }
      );
      if (verdict.verification_status !== 'SUCCESS') {
        return { ok: false, reason: 'bad_signature' };
      }
    } catch {
      // Network failure on the verification call. NOT ok — PayPal will retry.
      return { ok: false, reason: 'bad_signature' };
    }

    const eventId = str(event.id);
    if (!eventId) return { ok: false, reason: 'malformed' };

    const type = String(event.event_type ?? '');
    const resource = (event.resource ?? {}) as Record<string, unknown>;
    const kind = EVENT_MAP[type] ?? null;
    const meta = unpackCustomId(resource.custom_id ?? resource.custom);

    const amountObj = (resource.amount ?? {}) as Record<string, unknown>;
    // Sale events nest the value under `total`; captures under `value`.
    const rawAmount = amountObj.total ?? amountObj.value;
    let amountCents = centsFromPayPal(rawAmount);
    if (amountCents !== null && kind === 'charge_refunded') {
      // Refunds are stored negative, matching the payments table check.
      amountCents = -Math.abs(amountCents);
    }

    const subscriptionId =
      str(resource.billing_agreement_id) ?? (kind === 'checkout_completed' ? str(resource.id) : null);

    const normalized: NormalizedEvent = {
      providerEventId: eventId,
      kind,
      occurredAt: str(event.create_time) ?? new Date().toISOString(),
      providerSubscriptionId: subscriptionId,
      providerCustomerId: str((resource.subscriber as Record<string, unknown>)?.payer_id),
      providerPaymentId: str(resource.id),
      // Correlates to CheckoutResult.sessionRef, which is the subscription id.
      sessionRef: kind === 'checkout_completed' ? str(resource.id) : null,
      amountCents,
      currency: str(amountObj.currency_code ?? amountObj.currency),
      status: resource.status ? mapStatus(String(resource.status)) : null,
      currentPeriodStart: null,
      currentPeriodEnd: str(
        ((resource.billing_info ?? {}) as Record<string, unknown>).next_billing_time
      ),
      planCode: meta.planCode,
      prototypeId: meta.prototypeId,
      prospectId: meta.prospectId,
      failureReason: kind === 'invoice_payment_failed' ? type : null,
      // ONLY a completed sale means money moved. An activated subscription is
      // an authorisation, not a payment.
      paid: type === 'PAYMENT.SALE.COMPLETED',
      raw: event,
    };

    return { ok: true, events: [normalized] };
  },
};
