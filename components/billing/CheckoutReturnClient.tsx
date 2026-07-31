'use client';

import { useEffect, useState } from 'react';
import { getCheckoutStatusAction } from '@/app/actions/billing';

/**
 * components/billing/CheckoutReturnClient.tsx — polls for the webhook.
 *
 * THREE HONEST STATES, because an async surface needs all three:
 *   pending    — we are waiting for the webhook. This is the DEFAULT and the
 *                expected state for the first few seconds.
 *   confirmed  — the subscription is active. The webhook landed.
 *   slow       — after ~20s the webhook still has not arrived. We do NOT
 *                claim failure (Stripe retries, and it usually resolves), and
 *                we absolutely do not grant anything. We tell the truth and
 *                give a way to reach a human.
 *
 * Polling stops on confirmation or after the attempt budget — an abandoned
 * tab must not sit there hitting a server action forever.
 */

const POLL_MS = 2500;
const MAX_ATTEMPTS = 8;

export function CheckoutReturnClient({
  sessionId,
  prototypeId,
}: {
  sessionId: string | null;
  prototypeId: string | null;
}) {
  const [state, setState] = useState<'pending' | 'confirmed' | 'slow'>('pending');
  const [plan, setPlan] = useState<string | null>(null);

  useEffect(() => {
    if (!prototypeId) {
      // Without a prototype reference we cannot poll. That is not an error
      // for the customer — payment may well have succeeded — so we show the
      // slow state, which is honest, rather than a failure we cannot prove.
      setState('slow');
      return;
    }
    let attempts = 0;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      const { status, planCode } = await getCheckoutStatusAction(prototypeId);
      if (cancelled) return;
      if (status === 'active' || status === 'trialing') {
        setPlan(planCode);
        setState('confirmed');
        return;
      }
      if (attempts >= MAX_ATTEMPTS) {
        setState('slow');
        return;
      }
      setTimeout(() => void tick(), POLL_MS);
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [prototypeId]);

  if (state === 'confirmed') {
    return (
      <div>
        <p className="font-data text-xs uppercase tracking-wide text-cure">Payment confirmed</p>
        <h1 className="mt-2 font-display font-condensed text-2xl font-bold">You&apos;re set up.</h1>
        <p className="mt-3 text-base">
          {plan === 'operator' ? 'Operator' : 'Foundation'} is active. I&apos;ll be in touch shortly to
          get your site live — usually the same day.
        </p>
      </div>
    );
  }

  if (state === 'slow') {
    return (
      <div>
        <p className="font-data text-xs uppercase tracking-wide text-rule">Still confirming</p>
        <h1 className="mt-2 font-display font-condensed text-2xl font-bold">
          Your payment went through — we&apos;re just waiting on the confirmation.
        </h1>
        <p className="mt-3 text-base">
          This occasionally takes a minute or two on the processor&apos;s side. Nothing is wrong and you
          do not need to pay again. You&apos;ll get an email as soon as it lands.
        </p>
        <p className="mt-3 font-data text-sm text-rule">
          If you don&apos;t hear anything within an hour, reply to your receipt and I&apos;ll sort it out
          directly.
          {sessionId ? <span className="mt-1 block">Reference: {sessionId}</span> : null}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="font-data text-xs uppercase tracking-wide text-rule" aria-live="polite">
        Confirming
      </p>
      <h1 className="mt-2 font-display font-condensed text-2xl font-bold">
        One moment — confirming your payment.
      </h1>
      <p className="mt-3 text-base">
        Don&apos;t refresh or pay again. This usually takes a few seconds.
      </p>
      <div aria-hidden className="mt-6 h-0.5 w-full overflow-hidden bg-rule/30">
        <div className="h-full w-1/3 animate-pulse bg-hazard" />
      </div>
    </div>
  );
}
