'use server';

import { requireAdmin } from '@/lib/auth/admin';
import { setPaymentProvider, type PaymentProvider } from '@/lib/site/payment-provider';

/**
 * app/actions/paymentProvider.ts — change which processor is selected.
 *
 * requireAdmin() runs first, before anything is read or written, for the same
 * reason it does in appearance.ts and toolMedia.ts: a server action's endpoint
 * is reachable from any browser, and the page gate on /admin is not a
 * substitute for a check inside the action.
 *
 * It matters more here than anywhere else in admin. This one decides where
 * money goes.
 */

export type SetProviderResult =
  | { ok: true; provider: PaymentProvider }
  | { ok: false; message: string };

export async function setPaymentProviderAction(next: unknown): Promise<SetProviderResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, message: 'Not signed in as an admin. Sign in again and retry.' };
  }

  const provider: PaymentProvider = next === 'stripe' ? 'stripe' : 'paypal';
  const wrote = await setPaymentProvider(provider);
  if (!wrote) {
    return {
      ok: false,
      message:
        'That could not be saved. If migrations 0018 and 0020 have not been run yet, run them first.',
    };
  }
  return { ok: true, provider };
}
