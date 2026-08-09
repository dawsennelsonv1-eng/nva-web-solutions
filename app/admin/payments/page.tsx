import { PaymentProviderToggle } from '@/components/admin/PaymentProviderToggle';
import { getPaymentProvider, isProviderWired } from '@/lib/site/payment-provider';

/**
 * app/admin/payments/page.tsx — renders behind the existing /admin gate.
 *
 * force-dynamic: the whole point is showing what is live right now. A cached
 * admin screen showing a stale provider is how an operator concludes a switch
 * is broken and flips it twice.
 *
 * THE HONEST NOTE AT THE TOP IS NOT BOILERPLATE. This page can currently record
 * a preference and nothing more. Saying so here is what stops it being a switch
 * that appears to work — which, on the screen that decides where money goes, is
 * a more expensive mistake than not having the screen at all.
 */

export const dynamic = 'force-dynamic';

export default async function PaymentsAdminPage() {
  const provider = await getPaymentProvider();

  return (
    <div className="px-4 py-8">
      <h1 className="font-display text-2xl font-extrabold uppercase">Payments</h1>
      <p className="mt-2 max-w-[60ch] text-base">
        Which processor this deployment is set to use. PayPal is the default.
      </p>

      <div className="mt-4 max-w-[60ch] border border-ink bg-concrete p-3 text-sm">
        <strong>Read this first.</strong> This screen records a preference. No
        checkout code reads it yet, and there is no PayPal integration in the
        codebase — no order creation, no capture, no webhook verification. Until
        that exists, changing this changes what is stored and nothing else.
      </div>

      <div className="mt-6">
        <PaymentProviderToggle
          current={provider}
          wired={{ paypal: isProviderWired('paypal'), stripe: isProviderWired('stripe') }}
        />
      </div>
    </div>
  );
}
