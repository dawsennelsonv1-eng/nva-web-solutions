import 'server-only';
import { PaymentProviderError, type PaymentProvider } from './provider';

/**
 * lib/payments/paypal.ts — REGISTERED, NOT IMPLEMENTED.
 *
 * ============================================================================
 * WHY EVERY METHOD REFUSES
 * ============================================================================
 *
 * I have not written the PayPal API calls. I could have — the shapes are
 * public — but this is the money path, I cannot run it against a sandbox from
 * here, and I have never seen it succeed once.
 *
 * An untested payment adapter is not a partial feature. It is a feature that
 * looks finished. The failure mode is a contractor completing a PayPal
 * approval, landing on the return page, and not being activated because the
 * capture call was subtly wrong — while every screen says the payment provider
 * is PayPal. He has been charged and he has nothing.
 *
 * A provider that refuses is recoverable in five minutes. A provider that half
 * works produces a support problem you discover from an angry customer.
 *
 * So this file exists to make PayPal a REAL, SELECTABLE option in the registry
 * with a loud "not built yet", rather than leaving the toggle pointing at
 * nothing. lib/payments/index.ts:isProviderImplemented('paypal') returns false
 * and resolveSelectedProvider() throws before any checkout starts.
 *
 * ============================================================================
 * WHAT EACH METHOD HAS TO DO — WRITE THESE IN THIS ORDER
 * ============================================================================
 *
 * PayPal is NOT shaped like Stripe and the differences are where the bugs live:
 *
 * 1. createCheckout
 *    Subscriptions are v1 Billing: a Plan must already exist in PayPal, created
 *    from a Product. Stripe price ids do not translate — you need
 *    PAYPAL_PLAN_FOUNDATION / PAYPAL_PLAN_OPERATOR, alongside the existing
 *    STRIPE_PRICE_* rather than replacing them, so both rails stay switchable.
 *
 *    THE SETUP FEE IS THE HARD PART. Stripe takes a one-off line and a
 *    recurring line in one Checkout Session. PayPal subscriptions express a
 *    one-off as `plan.payment_preferences.setup_fee`, which is configured ON
 *    the plan, not per request. Two plans per tier — with and without setup —
 *    or a separate one-off order first. Decide deliberately; a wrong choice
 *    here silently under-charges every customer by the setup fee.
 *
 *    Return `{ url, sessionRef }` where url is the payer-action approve link
 *    and sessionRef is the subscription id, so the webhook can correlate.
 *
 * 2. handleWebhook — DO THIS BEFORE ANY OTHER METHOD IS TRUSTED
 *    PayPal has no HMAC header. Verification is a POST to
 *    /v1/notifications/verify-webhook-signature with the transmission headers,
 *    PAYPAL_WEBHOOK_ID and the raw body, and you must treat anything other than
 *    verification_status === 'SUCCESS' as bad_signature.
 *
 *    THAT IS A NETWORK CALL, so it can fail for reasons that are not forgery.
 *    A timeout must NOT be reported as ok — return bad_signature and let PayPal
 *    retry. Never grant an entitlement on an unverified event: SPEC R-606, and
 *    it is the rule this whole abstraction exists to protect.
 *
 *    Map onto the six NormalizedEventKind values:
 *      BILLING.SUBSCRIPTION.ACTIVATED  -> checkout_completed
 *      PAYMENT.SALE.COMPLETED          -> invoice_paid        (paid: true)
 *      BILLING.SUBSCRIPTION.CANCELLED  -> subscription_deleted
 *      BILLING.SUBSCRIPTION.SUSPENDED  -> subscription_updated (suspended)
 *      BILLING.SUBSCRIPTION.UPDATED    -> subscription_updated
 *      PAYMENT.SALE.REFUNDED           -> charge_refunded     (negative cents)
 *    Anything else: kind null. It is stored and acknowledged, per the contract.
 *
 *    providerEventId is the event `id` — that is the idempotency key the
 *    webhook route deduplicates on, and it must be the PayPal event id, never
 *    a value you construct.
 *
 * 3. getSubscription
 *    GET /v1/billing/subscriptions/{id}. Map PayPal's status onto
 *    NormalizedSubscriptionStatus: APPROVAL_PENDING and APPROVED are NOT
 *    active — money has not moved — so they map to trialing at most, never
 *    active. ACTIVE -> active, SUSPENDED -> suspended, CANCELLED -> canceled,
 *    EXPIRED -> canceled.
 *
 * 4. cancelSubscription
 *    POST /v1/billing/subscriptions/{id}/cancel. PayPal has no direct
 *    equivalent of Stripe's cancel_at_period_end; honouring atPeriodEnd
 *    probably means recording intent locally and cancelling on the date.
 *
 * 5. refund
 *    POST /v2/payments/captures/{id}/refund. Note the capture id is not the
 *    sale id from older webhook payloads — get this wrong and refunds 404.
 *
 * ============================================================================
 * WHEN IT WORKS
 * ============================================================================
 *
 * Flip isProviderImplemented('paypal') to true in lib/payments/index.ts, in the
 * same commit — not before, and not "temporarily to test". That function is
 * what stands between a selected provider and a customer's card.
 */
function notBuilt(method: string): never {
  throw new PaymentProviderError(
    `PayPal is registered but not implemented (${method}). ` +
      'Select Stripe in /admin/payments, or finish lib/payments/paypal.ts.',
    'not_configured'
  );
}

export const paypalProvider: PaymentProvider = {
  id: 'paypal',

  async createCheckout() {
    notBuilt('createCheckout');
  },

  async getSubscription() {
    // Null rather than throwing: a caller reconciling an existing subscription
    // should fall back to the local row, exactly as the manual provider does.
    // Nothing is granted on the basis of a null.
    return null;
  },

  async cancelSubscription() {
    notBuilt('cancelSubscription');
  },

  /**
   * NEVER return ok:true from here until real signature verification exists.
   * ok:true is the single statement in this codebase that can grant a paid
   * entitlement, and an unverified event is indistinguishable from a forged
   * one.
   */
  async handleWebhook() {
    return { ok: false, reason: 'not_configured' as const };
  },

  async refund() {
    notBuilt('refund');
  },
};
