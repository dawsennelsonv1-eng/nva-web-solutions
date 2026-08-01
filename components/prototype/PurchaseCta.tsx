'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/analytics.client';
import { createCheckoutAction } from '@/app/actions/billing';
import { useInViewport } from '@/components/marketing/useInViewport';
import type { Tier } from '@/types';

/**
 * components/prototype/PurchaseCta.tsx — "Get this live." Item 5, verbatim
 * requirements: reachable the instant he finishes testing (positioned right
 * after the widget mount point in DOM order — the parent page controls
 * that), carries the prototype's slug into checkout so what he tested is
 * exactly what he buys, and the offer stated in HIS language: short, no
 * agency prose.
 *
 * "CARRIES THE SLUG INTO CHECKOUT": createCheckoutAction (Phase 5.5) takes
 * prototypeId directly and threads it into Stripe metadata — the webhook
 * that later activates the subscription writes it onto THIS SAME prototype
 * row (lib/billing/process.ts's onCheckoutCompleted). There is no
 * environment switch between what he tested and what goes live; it is
 * mechanically the same row.
 *
 * entryPoint: 'self_serve' — this is the contractor tapping the button
 * himself, not Dawsen generating a link on his behalf (Phase 5.5's own
 * definition of the two entry points names /s/[slug] as self-serve
 * explicitly).
 */

export function PurchaseCta({
  prospectId,
  prototypeId,
  contractorEmail,
  foundationSetupDollars = 500,
  foundationMonthlyDollars = 250,
}: {
  prospectId: string;
  prototypeId: string;
  contractorEmail: string | null;
  foundationSetupDollars?: number;
  foundationMonthlyDollars?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { ref, active } = useInViewport<HTMLDivElement>();
  const viewedRef = useRef(false);

  useEffect(() => {
    if (active && !viewedRef.current) {
      viewedRef.current = true;
      track('prototype_cta_viewed', {}, { surface: 'prototype', mode: 'prototype', prototypeId });
    }
  }, [active, prototypeId]);

  async function handleClick(planCode: Tier) {
    setBusy(true);
    setError(null);
    track('prototype_cta_clicked', { plan_code: planCode }, { surface: 'prototype', mode: 'prototype', prototypeId });

    const result = await createCheckoutAction({
      prospectId,
      prototypeId,
      planCode,
      entryPoint: 'self_serve',
      customerEmail: contractorEmail ?? undefined,
    });

    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push(result.url);
  }

  return (
    <div ref={ref} className="rounded-milled border border-hazard/30 bg-hazard/5 p-5">
      <p className="font-display font-condensed text-xl font-bold">Get this live.</p>

      <ul className="mt-3 space-y-1.5 font-data text-sm">
        <li>${foundationSetupDollars} to set up, ${foundationMonthlyDollars}/month.</li>
        <li>0% of your revenue. A franchise takes 6\u20138% forever.</li>
        <li>30 days — not working, full refund on setup.</li>
      </ul>

      {error ? (
        <p role="alert" className="mt-3 rounded-milled border border-danger/40 bg-danger/5 p-2 text-sm">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleClick('foundation')}
        disabled={busy}
        className="mt-4 flex min-h-[3.25rem] w-full items-center justify-center rounded-milled bg-hazard px-4 font-body text-base font-semibold text-sheet disabled:opacity-60"
      >
        {busy ? 'One moment\u2026' : 'Get this live \u2014 $' + foundationSetupDollars}
      </button>
    </div>
  );
}
