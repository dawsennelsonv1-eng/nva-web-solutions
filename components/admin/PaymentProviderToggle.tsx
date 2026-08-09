'use client';

import { useState } from 'react';
import { setPaymentProviderAction } from '@/app/actions/paymentProvider';
import type { PaymentProvider } from '@/lib/site/payment-provider';

/**
 * components/admin/PaymentProviderToggle.tsx — the switch.
 *
 * ============================================================================
 * IT SHOWS WIRED STATUS BESIDE EACH CHOICE, NOT JUST WHICH IS SELECTED
 * ============================================================================
 *
 * The selected provider and the provider that can actually take money are two
 * different facts right now, and an admin screen that shows only the first
 * would be actively misleading — the operator flips it to PayPal, sees PayPal
 * highlighted, and reasonably concludes money is going to PayPal.
 *
 * So each option carries its own status line, and selecting one that is not
 * wired produces a standing warning that does not go away. That warning is
 * meant to be annoying. It is describing a state where a customer could believe
 * he has paid and be wrong.
 *
 * Legacy token system, like the rest of admin.
 */

export function PaymentProviderToggle({
  current,
  wired,
}: {
  current: PaymentProvider;
  /** Whether each provider can actually take a payment on this deployment. */
  wired: Record<PaymentProvider, boolean>;
}) {
  const [provider, setProvider] = useState<PaymentProvider>(current);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (next: PaymentProvider) => {
    if (next === provider || pending) return;
    setPending(true);
    setError(null);
    void (async () => {
      const r = await setPaymentProviderAction(next);
      if (r.ok) setProvider(r.provider);
      else setError(r.message);
      setPending(false);
    })();
  };

  const options: { id: PaymentProvider; label: string }[] = [
    { id: 'paypal', label: 'PayPal' },
    { id: 'stripe', label: 'Stripe' },
  ];

  return (
    <div className="max-w-xl">
      <div className="space-y-2">
        {options.map((o) => {
          const on = provider === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => choose(o.id)}
              disabled={pending}
              aria-pressed={on}
              className={
                'press block w-full rounded-milled border px-4 py-3 text-left ' +
                (on ? 'border-ink bg-hazard text-sheet' : 'border-rule bg-sheet')
              }
            >
              <span className="block text-base font-bold">{o.label}</span>
              <span className="mt-1 block text-sm">
                {wired[o.id]
                  ? 'Wired — can take a payment on this deployment.'
                  : 'Not wired — no working checkout path exists for this yet.'}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-sm">
        Selected: <strong>{provider === 'paypal' ? 'PayPal' : 'Stripe'}</strong>
      </p>

      {!wired[provider] && (
        <p className="mt-3 border border-ink bg-concrete p-3 text-sm">
          <strong>This selection cannot take money yet.</strong> The choice is
          saved, but no checkout code reads it and there is no working{' '}
          {provider === 'paypal' ? 'PayPal' : 'Stripe'} path on this deployment.
          Do not send a customer to pay until this line disappears.
        </p>
      )}

      {error && (
        <p className="mt-3 border border-rule bg-concrete p-3 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
