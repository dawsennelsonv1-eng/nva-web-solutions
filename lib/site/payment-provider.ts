import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * lib/site/payment-provider.ts — which processor this deployment is set to.
 *
 * Same shape as lib/site/theme.ts, deliberately: one row in site_settings, a
 * cached read invalidated by a tag, and an unrecognised value mapping onto the
 * default rather than throwing.
 *
 * ============================================================================
 * SELECTED IS NOT THE SAME AS WIRED, AND THIS FILE KEEPS THEM APART
 * ============================================================================
 *
 * getPaymentProvider()  answers "what has the operator chosen".
 * isProviderWired()     answers "can that choice actually take money today".
 *
 * They are separate functions because they currently have different answers:
 * PayPal is the default choice and there is no PayPal code in this repository.
 * One function conflating them would let a caller act on a selection that
 * cannot be honoured, and the failure mode of that is a customer who believes
 * he has paid.
 *
 * ============================================================================
 * ANY CHECKOUT CODE MUST CHECK BOTH — THIS IS THE IMPORTANT PART
 * ============================================================================
 *
 * A provider that is selected but not wired is a CONFIGURATION ERROR. Stop the
 * transaction and say so. Never fall through to the other processor.
 *
 * Silently charging a card through Stripe while the operator believes PayPal is
 * handling it is the worst available outcome here: the money lands in an
 * account nobody is watching, under a descriptor the customer will not
 * recognise, and the first sign of trouble is a chargeback. A checkout that
 * refuses to run is recoverable in five minutes. A checkout that quietly used
 * the wrong processor is not.
 *
 * ============================================================================
 * WIRING PAYPAL LATER — WHAT CHANGES, AND WHAT MUST NOT
 * ============================================================================
 *
 * Today isProviderWired reports Stripe as wired when STRIPE_SECRET_KEY is
 * present, and PayPal as never wired, because there is nothing to wire to.
 *
 * When a PayPal adapter exists, change the paypal branch to check its env
 * (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_WEBHOOK_ID) and nothing
 * else in this file moves.
 *
 * DO NOT flip it to true before the adapter can create an order, capture it and
 * verify a webhook. An env var being set is not the same as a code path
 * existing, and this function is what the checkout is going to trust.
 */

/**
 * PHASE 17F: this is the SELECTION, and lib/payments owns the implementations.
 *
 * The type is deliberately a subset of lib/payments' ProviderId. 'manual' and
 * 'stub' are real providers there but are not offered here — manual is chosen
 * per-payment by an admin recording a cheque, and stub must never be selectable
 * from a UI at all.
 */
export type PaymentProvider = 'paypal' | 'stripe';

export const DEFAULT_PAYMENT_PROVIDER: PaymentProvider = 'paypal';
export const PAYMENT_PROVIDER_TAG = 'payment-provider';

function normalise(value: string | null | undefined): PaymentProvider {
  return value === 'stripe' ? 'stripe' : 'paypal';
}

const readProvider = unstable_cache(
  async (): Promise<PaymentProvider> => {
    try {
      const db = getSupabaseAdminClient();
      const { data } = await db
        .from('site_settings')
        .select('value')
        .eq('key', 'payment_provider')
        .maybeSingle();
      return normalise(data?.value);
    } catch {
      return DEFAULT_PAYMENT_PROVIDER;
    }
  },
  ['payment-provider'],
  { tags: [PAYMENT_PROVIDER_TAG], revalidate: 3600 }
);

export async function getPaymentProvider(): Promise<PaymentProvider> {
  return readProvider();
}

/**
 * Can the selected provider actually take a payment on this deployment?
 *
 * PayPal is hardcoded false. That is not a placeholder to flip when somebody
 * feels optimistic — it stays false until an adapter exists that can create an
 * order, capture it, and verify a webhook.
 */
export function isProviderWired(provider: PaymentProvider): boolean {
  if (provider === 'stripe') {
    return (process.env.STRIPE_SECRET_KEY ?? '').trim().length > 0;
  }
  // PayPal is implemented and gated on its credentials, matching how Stripe is
  // judged here. Credentials present does NOT mean a transaction has ever
  // succeeded — see isProviderImplemented in lib/payments/index.ts. Run a
  // sandbox subscription before setting live credentials.
  return (
    (process.env.PAYPAL_CLIENT_ID ?? '').trim().length > 0 &&
    (process.env.PAYPAL_CLIENT_SECRET ?? '').trim().length > 0
  );
}

/**
 * Writes the choice. Callers must already have established that the request is
 * from an admin — this does not check, because it has no session to check
 * against, and a helper that pretends to authorise is worse than one that
 * plainly does not.
 */
export async function setPaymentProvider(provider: PaymentProvider): Promise<boolean> {
  try {
    const db = getSupabaseAdminClient();
    const { error } = await db
      .from('site_settings')
      .upsert(
        { key: 'payment_provider', value: provider, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    if (error) return false;
    revalidateTag(PAYMENT_PROVIDER_TAG);
    return true;
  } catch {
    return false;
  }
}
