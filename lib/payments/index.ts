import 'server-only';
import type { PaymentProvider, ProviderId } from './provider';
import { stripeProvider } from './stripe';
import { manualProvider } from './manual';
import { stubProvider } from './stub';

export * from './provider';

/**
 * lib/payments/index.ts — provider selection. THE ONLY place a provider is
 * chosen, so swapping merchant accounts or processors is one env var.
 *
 * PRODUCTION GUARD: the stub provider cannot be selected in production. A
 * fake payment processor that reports success is the most dangerous possible
 * misconfiguration in this codebase — it would activate subscriptions nobody
 * paid for, silently. If PAYMENT_PROVIDER is somehow 'stub' in production we
 * fall back to Stripe rather than honouring it, because failing loudly at a
 * missing STRIPE_SECRET_KEY is enormously better than succeeding falsely.
 */
export function getPaymentProvider(): PaymentProvider {
  const configured = (process.env.PAYMENT_PROVIDER ?? '').trim().toLowerCase() as ProviderId | '';
  const isProduction = process.env.NODE_ENV === 'production';

  if (configured === 'stub') {
    if (isProduction) {
      console.error('[payments] PAYMENT_PROVIDER=stub is refused in production; using stripe.');
      return stripeProvider;
    }
    return stubProvider;
  }
  if (configured === 'manual') return manualProvider;
  if (configured === 'stripe') return stripeProvider;

  // Unset: Stripe in production (fail loudly on missing keys rather than
  // quietly pretending), stub in development (so a fresh clone runs).
  return isProduction ? stripeProvider : stubProvider;
}

/** Named lookup, for the admin UI recording a payment against a chosen rail. */
export function getProviderById(id: ProviderId): PaymentProvider {
  if (id === 'manual') return manualProvider;
  if (id === 'stub') return stubProvider;
  return stripeProvider;
}
