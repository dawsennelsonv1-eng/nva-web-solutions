'use client';

import { useEffect } from 'react';

/**
 * (client) error boundary — for /s/[slug]. Same reassurance as (public)'s,
 * with no brand scope applied for the same reason not-found.tsx has none:
 * an error here means the page likely never finished resolving whose brand
 * it should even be.
 */
export default function ClientError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[client/error]', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-sm flex-col items-center justify-center bg-concrete px-4 text-center text-ink">
      <p className="font-data text-xs uppercase tracking-wide text-danger">Something went wrong</p>
      <h1 className="mt-2 font-display font-condensed text-2xl font-bold">That didn&apos;t load right.</h1>
      <p className="mt-2 text-base text-rule">Try again in a moment.</p>
      <button
        onClick={reset}
        className="mt-6 min-h-[3rem] rounded-milled bg-hazard px-6 py-3 font-body text-base font-semibold text-sheet"
      >
        Try again
      </button>
    </div>
  );
}
