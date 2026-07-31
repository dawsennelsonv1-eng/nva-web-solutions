'use client';

import { useEffect } from 'react';

/**
 * (admin) error boundary. The one place in this app where showing more
 * detail is reasonable — the audience is the operator himself, not a
 * homeowner — but error.message is still withheld by default (it can leak
 * a raw Postgres/Stripe error string); the digest id is shown instead so a
 * real report to Anthropic/Vercel logs can be correlated without exposing
 * internals on screen.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[admin/error]', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="rounded-milled border border-danger/40 bg-danger/5 p-4">
        <p className="font-data text-xs uppercase tracking-wide text-danger">Admin error</p>
        <h1 className="mt-1 font-display font-condensed text-xl font-bold">Something broke.</h1>
        {error.digest ? (
          <p className="mt-2 font-data text-xs text-rule">Reference: {error.digest}</p>
        ) : null}
        <button
          onClick={reset}
          className="mt-4 min-h-[2.75rem] rounded-milled border border-ink bg-sheet px-4 font-data text-sm font-semibold"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
