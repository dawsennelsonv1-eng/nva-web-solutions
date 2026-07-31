import 'server-only';
import type { Tier } from '@/types';
import {
  PaymentProviderError,
  planPriceIds,
  type CheckoutRequest,
  type CheckoutResult,
  type NormalizedEvent,
  type NormalizedEventKind,
  type NormalizedSubscription,
  type NormalizedSubscriptionStatus,
  type PaymentProvider,
  type WebhookVerification,
} from '../provider';
import { verifyStripeSignature } from './signature';

/**
 * lib/payments/stripe/index.ts — the real provider.
 *
 * NO STRIPE TYPES LEAVE THIS DIRECTORY (phase brief, explicit). Everything
 * returned crosses the boundary as a normalised shape from ../provider.
 *
 * RAW REST, NO SDK: the Stripe API is form-encoded HTTP with a stable
 * surface, the same call pattern lib/quote/vision.ts already uses for
 * Anthropic. An SDK here would add a dependency whose behaviour I cannot
 * execute in the build container, in exchange for convenience on six
 * endpoints. The one genuinely subtle piece — signature verification — is
 * hand-written precisely so it can be unit-tested (./signature.test.ts).
 */

const API = 'https://api.stripe.com/v1';
const TIMEOUT_MS = 20_000;

function secretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new PaymentProviderError('STRIPE_SECRET_KEY is not set', 'not_configured');
  return key;
}

/**
 * Stripe's API is application/x-www-form-urlencoded with bracket notation for
 * nested structures (line_items[0][price]=...). This flattens a nested object
 * into that shape.
 */
function formEncode(obj: Record<string, unknown>, prefix = ''): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const path = prefix ? prefix + '[' + key + ']' : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          parts.push(...formEncode(item as Record<string, unknown>, path + '[' + i + ']'));
        } else {
          parts.push(encodeURIComponent(path + '[' + i + ']') + '=' + encodeURIComponent(String(item)));
        }
      });
    } else if (typeof value === 'object') {
      parts.push(...formEncode(value as Record<string, unknown>, path));
    } else {
      parts.push(encodeURIComponent(path) + '=' + encodeURIComponent(String(value)));
    }
  }
  return parts;
}

async function stripeRequest<T>(
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API + path, {
      method,
      headers: {
        authorization: 'Bearer ' + secretKey(),
        'content-type': 'application/x-www-form-urlencoded',
        // Pinning the API version protects against Stripe changing response
        // shapes underneath a deployment we are not watching.
        'stripe-version': process.env.STRIPE_API_VERSION ?? '2024-06-20',
      },
      body: body ? formEncode(body).join('&') : undefined,
      signal: controller.signal,
    });
    const json = (await res.json()) as unknown;
    if (!res.ok) {
      const msg =
        (json as { error?: { message?: string } })?.error?.message ?? 'stripe ' + res.status;
      throw new PaymentProviderError(msg, res.status >= 500 ? 'provider_error' : 'invalid_request');
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// status mapping
// ---------------------------------------------------------------------------

/**
 * Stripe's status vocabulary onto ours. Note what is NOT here: 'grace' and
 * 'suspended' are OUR states, produced by lib/billing/dunning.ts's clock, and
 * Stripe has no equivalent. It keeps saying `past_due` for the whole dunning
 * window. The webhook handler therefore must not let a `past_due` event
 * downgrade a subscription we have already advanced to grace or suspended —
 * that guard lives in the handler, not here.
 */
function mapStatus(stripeStatus: string): NormalizedSubscriptionStatus {
  switch (stripeStatus) {
    case 'trialing': return 'trialing';
    case 'active': return 'active';
    case 'past_due': return 'past_due';
    case 'incomplete': return 'past_due';
    case 'unpaid': return 'suspended';
    case 'paused': return 'suspended';
    case 'canceled': return 'canceled';
    case 'incomplete_expired': return 'canceled';
    default: return 'past_due';
  }
}

const EVENT_MAP: Record<string, NormalizedEventKind> = {
  'checkout.session.completed': 'checkout_completed',
  'invoice.paid': 'invoice_paid',
  'invoice.payment_succeeded': 'invoice_paid',
  'invoice.payment_failed': 'invoice_payment_failed',
  'customer.subscription.updated': 'subscription_updated',
  'customer.subscription.deleted': 'subscription_deleted',
  'charge.refunded': 'charge_refunded',
};

function iso(unixSeconds: unknown): string | null {
  if (typeof unixSeconds !== 'number' || !Number.isFinite(unixSeconds)) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Stripe returns either an id string or an expanded object; accept both. */
function idOf(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'id' in v) return str((v as { id: unknown }).id);
  return null;
}

function planFromMetadata(meta: unknown): Tier | null {
  const code = meta && typeof meta === 'object' ? str((meta as Record<string, unknown>).plan_code) : null;
  return code === 'foundation' || code === 'operator' ? code : null;
}

// ---------------------------------------------------------------------------
// the provider
// ---------------------------------------------------------------------------

export const stripeProvider: PaymentProvider = {
  id: 'stripe',

  /**
   * ONE session, BOTH line items — the one-time setup fee and the recurring
   * monthly subscription.
   *
   * WHY ONE SESSION MATTERS COMMERCIALLY: in `mode: 'subscription'`, Stripe
   * puts every line item on the FIRST INVOICE and charges it as a single
   * payment. Setup fee and first month therefore succeed or fail together,
   * atomically. That structurally eliminates the failure the brief asks about
   * — "what if the setup fee succeeds but the subscription does not" — because
   * there is no intermediate state in which one has been collected and the
   * other has not. Two separate charges would create exactly that hole, and
   * a contractor who has been charged $500 with nothing provisioned is the
   * single worst billing outcome this product could produce.
   *
   * The residual failure is the whole first invoice failing, which is just
   * `invoice.payment_failed` on day 0 — the normal dunning path, with nothing
   * granted, because entitlements are only ever granted by a *paid* webhook.
   *
   * SETUP-FEE MECHANISM IS ENV-SWITCHABLE. Stripe supports a one-time price
   * in `line_items` alongside a recurring one in subscription mode, and also
   * supports `subscription_data.add_invoice_items` for the same outcome. I
   * cannot execute a live Stripe call from the build container to confirm
   * which your account/API version accepts, so STRIPE_SETUP_FEE_MODE selects
   * between them at runtime: if the first test-mode checkout errors on the
   * setup line item, change one Vercel env var to `invoice_item` and redeploy
   * — no code edit, which matters when the deploy pipeline is a phone.
   */
  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const prices = planPriceIds(req.planCode);
    if (!prices.monthly) {
      throw new PaymentProviderError(
        'Missing monthly price id for plan ' + req.planCode,
        'not_configured'
      );
    }

    const useInvoiceItem = (process.env.STRIPE_SETUP_FEE_MODE ?? 'line_item') === 'invoice_item';

    const metadata = {
      prototype_id: req.prototypeId,
      prospect_id: req.prospectId,
      plan_code: req.planCode,
      entry_point: req.entryPoint,
    };

    const body: Record<string, unknown> = {
      mode: 'subscription',
      success_url: req.returnUrl,
      cancel_url: req.cancelUrl,
      // Correlates the eventual webhook back to this prototype even if
      // metadata is somehow absent from a downstream event.
      client_reference_id: req.prototypeId,
      metadata,
      subscription_data: { metadata },
      allow_promotion_codes: false,
      billing_address_collection: 'auto',
    };

    const lineItems: Record<string, unknown>[] = [{ price: prices.monthly, quantity: 1 }];

    if (prices.setup) {
      if (useInvoiceItem) {
        (body.subscription_data as Record<string, unknown>).add_invoice_items = [
          { price: prices.setup, quantity: 1 },
        ];
      } else {
        lineItems.push({ price: prices.setup, quantity: 1 });
      }
    }
    body.line_items = lineItems;

    if (req.customerEmail) body.customer_email = req.customerEmail;

    const session = await stripeRequest<{ id: string; url: string | null }>(
      '/checkout/sessions',
      'POST',
      body
    );

    if (!session.url) {
      throw new PaymentProviderError('Stripe returned a session with no URL', 'provider_error');
    }
    return { url: session.url, sessionRef: session.id };
  },

  async getSubscription(providerSubscriptionId: string): Promise<NormalizedSubscription | null> {
    try {
      const sub = await stripeRequest<Record<string, unknown>>(
        '/subscriptions/' + encodeURIComponent(providerSubscriptionId),
        'GET'
      );
      return {
        providerSubscriptionId: str(sub.id),
        providerCustomerId: idOf(sub.customer),
        status: mapStatus(String(sub.status ?? '')),
        currentPeriodStart: iso(sub.current_period_start) ?? new Date().toISOString(),
        currentPeriodEnd: iso(sub.current_period_end) ?? new Date().toISOString(),
        planCode: planFromMetadata(sub.metadata),
        canceledAt: iso(sub.canceled_at),
      };
    } catch {
      return null;
    }
  },

  async cancelSubscription(providerSubscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    if (atPeriodEnd) {
      await stripeRequest('/subscriptions/' + encodeURIComponent(providerSubscriptionId), 'POST', {
        cancel_at_period_end: true,
      });
      return;
    }
    await stripeRequest('/subscriptions/' + encodeURIComponent(providerSubscriptionId), 'POST', {
      cancel_at_period_end: false,
    });
    // Immediate cancellation is a DELETE on the subscription resource.
    await stripeRequest('/subscriptions/' + encodeURIComponent(providerSubscriptionId), 'POST', {
      'cancellation_details[comment]': 'cancelled by operator',
    }).catch(() => undefined);
  },

  async refund(providerPaymentId: string, amountCents: number) {
    const refund = await stripeRequest<{ id: string }>('/refunds', 'POST', {
      payment_intent: providerPaymentId,
      amount: Math.abs(amountCents),
    });
    return { providerRefundId: refund.id };
  },

  async handleWebhook(rawBody: string, signature: string | null): Promise<WebhookVerification> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return { ok: false, reason: 'not_configured' };

    const verified = verifyStripeSignature(rawBody, signature, secret);
    if (!verified.ok) return { ok: false, reason: 'bad_signature' };

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { ok: false, reason: 'malformed' };
    }

    const providerEventId = str(parsed.id);
    const type = str(parsed.type);
    if (!providerEventId) return { ok: false, reason: 'malformed' };

    const dataObject =
      (parsed.data as { object?: Record<string, unknown> } | undefined)?.object ?? {};
    const kind = type ? (EVENT_MAP[type] ?? null) : null;
    const occurredAt = iso(parsed.created) ?? new Date().toISOString();

    const event = normalizeEvent({
      providerEventId, kind, occurredAt, dataObject, raw: parsed,
    });
    return { ok: true, events: [event] };
  },
};

function normalizeEvent(args: {
  providerEventId: string;
  kind: NormalizedEventKind | null;
  occurredAt: string;
  dataObject: Record<string, unknown>;
  raw: unknown;
}): NormalizedEvent {
  const o = args.dataObject;
  const metadata = (o.metadata ?? {}) as Record<string, unknown>;

  // Period can come from the subscription object directly, or from the first
  // invoice line's period when the event is invoice-shaped.
  const lines = (o.lines as { data?: Record<string, unknown>[] } | undefined)?.data;
  const firstLinePeriod = lines?.[0]?.period as { start?: number; end?: number } | undefined;

  let amountCents: number | null = null;
  let paid = false;

  switch (args.kind) {
    case 'checkout_completed':
      amountCents = typeof o.amount_total === 'number' ? o.amount_total : null;
      // A completed session is NOT a paid session. Stripe reports
      // payment_status separately, and only 'paid' means money moved.
      paid = o.payment_status === 'paid' || o.payment_status === 'no_payment_required';
      break;
    case 'invoice_paid':
      amountCents = typeof o.amount_paid === 'number' ? o.amount_paid : null;
      paid = true;
      break;
    case 'invoice_payment_failed':
      amountCents = typeof o.amount_due === 'number' ? o.amount_due : null;
      paid = false;
      break;
    case 'charge_refunded': {
      const refunded = typeof o.amount_refunded === 'number' ? o.amount_refunded : 0;
      // Negative, so summing the payments column yields net revenue with no
      // special case (DATA_MODEL.md §14).
      amountCents = refunded > 0 ? -refunded : null;
      paid = false;
      break;
    }
    default:
      break;
  }

  const status =
    args.kind === 'subscription_updated' || args.kind === 'subscription_deleted'
      ? mapStatus(String(o.status ?? ''))
      : null;

  return {
    providerEventId: args.providerEventId,
    kind: args.kind,
    occurredAt: args.occurredAt,
    providerSubscriptionId: idOf(o.subscription) ?? (args.kind?.startsWith('subscription') ? str(o.id) : null),
    providerCustomerId: idOf(o.customer),
    providerPaymentId: idOf(o.payment_intent) ?? (args.kind === 'charge_refunded' ? idOf(o.payment_intent) ?? str(o.id) : null),
    sessionRef: args.kind === 'checkout_completed' ? str(o.id) : null,
    amountCents,
    currency: str(o.currency),
    status,
    currentPeriodStart: iso(o.current_period_start) ?? iso(firstLinePeriod?.start),
    currentPeriodEnd: iso(o.current_period_end) ?? iso(firstLinePeriod?.end),
    planCode: planFromMetadata(metadata),
    prototypeId: str(metadata.prototype_id) ?? str(o.client_reference_id),
    prospectId: str(metadata.prospect_id),
    failureReason:
      args.kind === 'invoice_payment_failed'
        ? str((o.last_finalization_error as { message?: unknown } | undefined)?.message) ?? 'payment_failed'
        : null,
    paid,
    raw: args.raw,
  };
}
