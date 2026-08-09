import 'server-only';
import { PaymentProviderError, type PaymentProvider, type ProviderId } from './provider';
import { stripeProvider } from './stripe';
import { paypalProvider } from './paypal';
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
  if (configured === 'paypal') return paypalProvider;
  if (configured === 'stripe') return stripeProvider;

  // Unset: Stripe in production (fail loudly on missing keys rather than
  // quietly pretending), stub in development (so a fresh clone runs).
  return isProduction ? stripeProvider : stubProvider;
}

/**
 * Named lookup, for the admin UI recording a payment against a chosen rail.
 *
 * PHASE 12A: this function carried none of the production guard its sibling
 * spends eleven lines arguing for. getProviderById('stub') returned the stub
 * in production, which meant the codebase's stated most-dangerous-possible
 * misconfiguration was reachable through the back door of the same module
 * that forbids it at the front. No current call site passes 'stub' — the only
 * caller is a hardcoded getProviderById('stripe') in app/actions/billing.ts —
 * so this was latent rather than live. It is fixed as a latent bug because
 * `id` is typed ProviderId and TypeScript types are erased at runtime: the
 * day something derives that argument from a form field, the type says
 * nothing and this throw is the only thing left.
 *
 * Throwing rather than silently substituting Stripe, because unlike the env
 * var above there is no benign reason for a production call site to name the
 * stub. That is a bug in the caller and it should be loud.
 */
export function getProviderById(id: ProviderId): PaymentProvider {
  if (id === 'manual') return manualProvider;
  if (id === 'paypal') return paypalProvider;
  if (id === 'stub') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[payments] The stub provider cannot be used in production.');
    }
    return stubProvider;
  }
  return stripeProvider;
}

/**
 * ============================================================================
 * ASYNC, DATABASE-BACKED SELECTION — PHASE 17F
 * ============================================================================
 *
 * getPaymentProvider() above is synchronous and reads PAYMENT_PROVIDER. It is
 * unchanged and every existing caller still works.
 *
 * This one lets the operator choose from /admin/payments without a deploy,
 * which was the whole point of the toggle. It reads site_settings and falls
 * back to the env var, so a deployment that has never touched the admin screen
 * behaves exactly as before.
 *
 * ============================================================================
 * IT REFUSES TO RETURN AN UNIMPLEMENTED PROVIDER
 * ============================================================================
 *
 * If the stored choice is a provider whose adapter cannot take money, this
 * THROWS rather than substituting a working one.
 *
 * That is the same reasoning the stub guard above spends eleven lines on, in
 * the opposite direction. Falling back to Stripe when the operator has selected
 * PayPal would charge a customer's card through an account the operator is not
 * watching, under a descriptor the customer will not recognise, while the admin
 * screen says PayPal. The first sign of trouble would be a chargeback.
 *
 * A checkout that refuses to start is a five-minute configuration fix. A
 * checkout that quietly used the wrong processor is a reconciliation problem
 * and a trust problem.
 *
 * WEBHOOK ROUTES MUST NOT USE THIS. A webhook is answered by the provider that
 * SENT it, identified by its URL — never by whatever is currently selected.
 * Both processors can have in-flight events during a switch. See
 * app/api/webhooks/stripe/route.ts.
 */
export async function resolveSelectedProvider(): Promise<PaymentProvider> {
  const { getPaymentProvider: readSetting } = await import('@/lib/site/payment-provider');
  const selected = await readSetting();

  const provider = getProviderById(selected);
  if (!isProviderImplemented(provider.id)) {
    throw new PaymentProviderError(
      `The selected payment provider (${provider.id}) has no working checkout on this deployment. ` +
        'Change it in /admin/payments, or finish the adapter. Refusing rather than using a different processor.',
      'not_configured'
    );
  }
  return provider;
}

/**
 * Whether an adapter can actually move money on THIS deployment.
 *
 * PayPal is now implemented (lib/payments/paypal.ts) and gated on its
 * credentials, which is the same standard Stripe is held to — STRIPE_SECRET_KEY
 * present means wired.
 *
 * ============================================================================
 * CONFIGURED IS NOT THE SAME AS PROVEN, AND THIS FUNCTION CANNOT TELL
 * ============================================================================
 *
 * Setting PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET makes this return true. It
 * does NOT mean a subscription has ever completed, that the plan carries the
 * setup fee, or that a webhook has ever verified. No function can check those
 * from here.
 *
 * POINT IT AT SANDBOX FIRST (PAYPAL_ENV=sandbox) and run one subscription end
 * to end before putting live credentials in. The gate that protects a real
 * customer is which credentials you set, and that gate is yours, not this
 * function's.
 */
export function isProviderImplemented(id: ProviderId): boolean {
  if (id === 'paypal') {
    return (
      (process.env.PAYPAL_CLIENT_ID ?? '').trim().length > 0 &&
      (process.env.PAYPAL_CLIENT_SECRET ?? '').trim().length > 0
    );
  }
  return true;
}
