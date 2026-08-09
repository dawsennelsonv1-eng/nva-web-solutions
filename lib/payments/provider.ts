import 'server-only';
import type { Tier } from '@/types';

/**
 * lib/payments/provider.ts — THE PAYMENT PROVIDER CONTRACT.
 *
 * WHY THIS EXISTS AT ALL (from the phase brief): the legal seller today is a
 * partner's Canadian business on their Stripe account, and it becomes an
 * NVA-owned US LLC later. That migration must be a config change, not a
 * rewrite. So every type in this file is NORMALISED — no Stripe shape,
 * no Stripe field name, no Stripe enum ever crosses this boundary. Anything
 * importing from '@/lib/payments' can be made to work against a different
 * processor by writing one new implementation of PaymentProvider.
 *
 * THE HARD RULE THIS FILE ENCODES: nothing here returns "the user has paid."
 * createCheckout returns a URL. A checkout redirect is a navigation event,
 * not a payment confirmation — only a signature-verified webhook may change
 * a subscription status or grant an entitlement (money rule #3, SPEC R-606).
 * That is why there is no `confirmPayment()` on this interface: there is no
 * legitimate caller for one.
 */

/**
 * PHASE 17F: 'paypal' registered.
 *
 * Adding it here rather than anywhere else is the point of this file — the
 * contract below is already normalised, so a second real processor is one new
 * implementation of PaymentProvider and nothing downstream changes shape.
 *
 * SEE lib/payments/paypal.ts BEFORE SELECTING IT. It is registered, not
 * implemented: every method refuses. That is deliberate, and the reasoning is
 * in that file.
 */
export type ProviderId = 'stripe' | 'paypal' | 'manual' | 'stub';

/** Normalised subscription status — deliberately identical to the DB enum. */
export type NormalizedSubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'grace'
  | 'suspended'
  | 'canceled';

export interface CheckoutRequest {
  prospectId: string;
  prototypeId: string;
  planCode: Tier;
  /** Where the customer lands after paying. Must NOT grant access itself. */
  returnUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  /** Admin-generated links carry this so we can tell the two entry points apart. */
  entryPoint: 'self_serve' | 'admin_link';
}

export interface CheckoutResult {
  url: string;
  /** Opaque provider reference, stored so a later webhook can be correlated. */
  sessionRef: string;
}

export interface NormalizedSubscription {
  providerSubscriptionId: string | null;
  providerCustomerId: string | null;
  status: NormalizedSubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  planCode: Tier | null;
  canceledAt: string | null;
}

/**
 * The normalised event vocabulary. A provider implementation maps its own
 * event names onto these six; nothing downstream ever sees a Stripe event
 * type string. Six is the complete set the billing system reacts to — a
 * provider event that maps to none of these is stored and acknowledged
 * without further processing, which is correct: we record everything and
 * act on what we understand.
 */
export type NormalizedEventKind =
  | 'checkout_completed'
  | 'invoice_paid'
  | 'invoice_payment_failed'
  | 'subscription_updated'
  | 'subscription_deleted'
  | 'charge_refunded';

export interface NormalizedEvent {
  /** The provider's own unique event id — THE idempotency key. */
  providerEventId: string;
  kind: NormalizedEventKind | null;
  /** Provider event timestamp. Used to reject out-of-order status changes. */
  occurredAt: string;
  providerSubscriptionId: string | null;
  providerCustomerId: string | null;
  providerPaymentId: string | null;
  /** Present on checkout_completed — correlates back to CheckoutResult.sessionRef. */
  sessionRef: string | null;
  /** Integer cents. Negative for refunds, matching the payments table check. */
  amountCents: number | null;
  currency: string | null;
  status: NormalizedSubscriptionStatus | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  planCode: Tier | null;
  prototypeId: string | null;
  prospectId: string | null;
  failureReason: string | null;
  /** True only when the provider confirms money actually moved. */
  paid: boolean;
  /** The untouched provider payload, stored verbatim in webhook_events. */
  raw: unknown;
}

export type WebhookVerification =
  | { ok: true; events: NormalizedEvent[] }
  | { ok: false; reason: 'bad_signature' | 'malformed' | 'not_configured' };

export interface PaymentProvider {
  readonly id: ProviderId;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  getSubscription(providerSubscriptionId: string): Promise<NormalizedSubscription | null>;
  cancelSubscription(providerSubscriptionId: string, atPeriodEnd: boolean): Promise<void>;
  /**
   * Verifies AND normalises in one step, deliberately: a caller must not be
   * able to obtain parsed events without having proven the signature first.
   * Splitting these into verify() then parse() would make it possible to
   * call parse() alone, and that is the shape of a real vulnerability.
   */
  handleWebhook(rawBody: string, signature: string | null): Promise<WebhookVerification>;
  /** Refunds are recorded as negative-amount payments (DATA_MODEL.md §14). */
  refund(providerPaymentId: string, amountCents: number): Promise<{ providerRefundId: string }>;
}

/**
 * Which price ids back each tier. Read from env so the same code runs against
 * the partner's Stripe account today and an NVA-owned account later, with no
 * deploy — only new env values.
 */
export interface PlanPriceIds {
  setup: string | undefined;
  monthly: string | undefined;
}

export function planPriceIds(planCode: Tier): PlanPriceIds {
  if (planCode === 'operator') {
    return {
      setup: process.env.STRIPE_PRICE_OPERATOR_SETUP,
      monthly: process.env.STRIPE_PRICE_OPERATOR_MONTHLY,
    };
  }
  return {
    setup: process.env.STRIPE_PRICE_FOUNDATION_SETUP,
    monthly: process.env.STRIPE_PRICE_FOUNDATION_MONTHLY,
  };
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'provider_error' | 'invalid_request'
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

