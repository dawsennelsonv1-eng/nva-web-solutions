'use client';

import { useEffect } from 'react';

/**
 * (public) error boundary. This is the surface most likely to be hit by a
 * paid-traffic visitor mid-quote — copy stays reassuring and specific:
 * nothing they entered is lost, and there's a concrete next step.
 */
export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[public/error]', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-sm flex-col items-center justify-center px-4 text-center">
      <p className="font-data text-xs uppercase tracking-wide text-danger">Something went wrong</p>
      <h1 className="mt-2 font-display font-condensed text-2xl font-bold">That didn&apos;t load right.</h1>
      <p className="mt-2 text-base text-rule">Nothing you entered was lost. Try again.</p>
      <button
        onClick={reset}
        className="mt-6 min-h-[3rem] rounded-milled bg-hazard px-6 py-3 font-body text-base font-semibold text-sheet"
      >
        Try again
      </button>
    </div>
  );
}
