import 'server-only';
import { PaymentProviderError, type PaymentProvider } from './provider';

/**
 * lib/payments/manual.ts — THE MANUAL PROVIDER. Not a stub. A permanent path.
 *
 * Wires, cash, cheques, and the contractor who wants an invoice and will not
 * type a card into a website are all normal in this trade — a fifty-year-old
 * concrete contractor in Dallas asking to pay by check is not an edge case,
 * he is a customer. This provider exists so that customer can be onboarded
 * through the same subscription/payments/entitlement machinery as everyone
 * else, rather than through a database edit somebody has to remember to make
 * correctly at 11pm.
 *
 * There is no hosted page and no webhook: the admin records the payment by
 * hand in /admin/billing, which writes the same rows a Stripe webhook would
 * have written. createCheckout therefore throws rather than returning a fake
 * URL — a caller reaching here with a checkout request has a real bug, and a
 * plausible-looking dead link would hide it.
 */
export const manualProvider: PaymentProvider = {
  id: 'manual',

  async createCheckout() {
    throw new PaymentProviderError(
      'The manual provider has no hosted checkout. Record the payment in /admin/billing instead.',
      'invalid_request'
    );
  },

  // A manual subscription's truth lives entirely in our own database; there
  // is no external system to reconcile against. Returning null is honest —
  // the caller falls back to the local row, which is authoritative here.
  async getSubscription() {
    return null;
  },

  async cancelSubscription() {
    // Cancellation is a database status change performed by the admin UI.
    // Nothing external to call.
  },

  async handleWebhook() {
    // No provider means no callbacks. Reporting 'not_configured' rather than
    // a signature failure keeps the webhook route's logging honest about why.
    return { ok: false, reason: 'not_configured' as const };
  },

  async refund() {
    throw new PaymentProviderError(
      'Manual refunds are issued outside the system and recorded in /admin/billing.',
      'invalid_request'
    );
  },
};
