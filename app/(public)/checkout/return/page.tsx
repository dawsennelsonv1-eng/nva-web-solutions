import type { Metadata } from 'next';
import { CheckoutReturnClient } from '@/components/billing/CheckoutReturnClient';

/**
 * /checkout/return — THE PENDING STATE. This page NEVER grants access.
 *
 * A customer lands here because Stripe redirected them, and a redirect proves
 * only that a browser navigated — not that money moved (money rule #3,
 * SPEC R-606). The webhook may arrive before this page renders, or seconds
 * after, or on a retry a minute later. So this page reads the subscription
 * status and reports what it sees, polling until the webhook lands.
 *
 * If it never lands, the page says so plainly and gives a way to get help —
 * it does not pretend, and it does not silently activate anything.
 */

export const metadata: Metadata = {
  title: 'Finishing up',
  robots: { index: false, follow: false },
};

export default function CheckoutReturnPage({
  searchParams,
}: {
  searchParams: { session_id?: string; prototype_id?: string };
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <CheckoutReturnClient
        sessionId={searchParams.session_id ?? null}
        prototypeId={searchParams.prototype_id ?? null}
      />
    </div>
  );
}
