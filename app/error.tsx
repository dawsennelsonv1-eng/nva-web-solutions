'use client';

import { useEffect } from 'react';

/**
 * app/error.tsx — the ROOT error boundary. Must be a Client Component
 * (Next.js requirement: it receives `error` and `reset` as props and needs
 * the interactive retry button). Catches anything an inner boundary didn't.
 *
 * No stack trace, no error.message rendered to the visitor — this can be
 * hit by a homeowner mid-quote, and a raw exception string is both
 * unhelpful to them and a minor information leak. It's logged to the
 * console for now; Phase 12A wires real error reporting.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app/error]', error);
  }, [error]);

  return (
    <html lang="en" data-theme="light">
      <body>
        <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-4 text-center">
          <p className="font-data text-xs uppercase tracking-wide text-danger">Something went wrong</p>
          <h1 className="mt-2 font-display font-condensed text-2xl font-bold">
            That didn&apos;t load right.
          </h1>
          <p className="mt-2 text-base text-rule">
            Nothing you entered was lost. Try again, or reload the page.
          </p>
          <button
            onClick={reset}
            className="mt-6 min-h-[3rem] rounded-milled bg-hazard px-6 py-3 font-body text-base font-semibold text-sheet"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
