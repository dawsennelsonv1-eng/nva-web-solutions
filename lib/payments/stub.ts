import 'server-only';
import {
  planPriceIds,
  type CheckoutRequest,
  type NormalizedSubscription,
  type PaymentProvider,
} from './provider';

/**
 * lib/payments/stub.ts — a DETERMINISTIC fake, for local reasoning and for
 * walking the billing UI without touching Stripe.
 *
 * Deterministic means: same input, same output, every time. No randomness,
 * no clock-derived ids beyond the period window. That is what makes it
 * usable in docs/BILLING_TESTS.md as a baseline — if behaviour differs
 * between two runs against this provider, the bug is in our code, not in the
 * fake.
 *
 * SAFETY: this provider REFUSES TO LOAD IN PRODUCTION (see ./index.ts). A
 * stub that silently activates subscriptions is the most dangerous file in
 * the repository if it ever runs against real customers.
 */
function fakeId(prefix: string, seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return prefix + '_stub_' + (h >>> 0).toString(16);
}

export const stubProvider: PaymentProvider = {
  id: 'stub',

  async createCheckout(req: CheckoutRequest) {
    const prices = planPriceIds(req.planCode);
    const sessionRef = fakeId('cs', req.prototypeId + req.planCode);
    // Lands straight on the real return page so the pending-until-webhook
    // state can be exercised without a payment processor in the loop.
    const url =
      req.returnUrl +
      (req.returnUrl.includes('?') ? '&' : '?') +
      'session_id=' + encodeURIComponent(sessionRef) +
      '&stub=1' +
      (prices.monthly ? '' : '&missing_price=1');
    return { url, sessionRef };
  },

  async getSubscription(providerSubscriptionId: string): Promise<NormalizedSubscription> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return {
      providerSubscriptionId,
      providerCustomerId: fakeId('cus', providerSubscriptionId),
      status: 'active',
      currentPeriodStart: start.toISOString(),
      currentPeriodEnd: end.toISOString(),
      planCode: 'foundation',
      canceledAt: null,
    };
  },

  async cancelSubscription() {
    // no-op
  },

  async handleWebhook() {
    // The stub deliberately does NOT accept synthetic webhooks. Granting
    // entitlements from an unsigned request is the exact hole the whole
    // webhook design exists to close, and a convenience hatch here would
    // reopen it. Simulate billing states by writing rows directly in the
    // SQL editor instead — docs/BILLING_TESTS.md gives the statements.
    return { ok: false, reason: 'not_configured' as const };
  },

  async refund(providerPaymentId: string) {
    return { providerRefundId: fakeId('re', providerPaymentId) };
  },
};
