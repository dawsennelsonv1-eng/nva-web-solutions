'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { GradientField } from '@/components/site/GradientField';

/**
 * (public) error boundary — PHASE 15C restyle.
 *
 * This is the surface most likely to be hit by a paid-traffic visitor
 * mid-quote, so the copy stays reassuring and specific: nothing they entered is
 * lost, and there is a concrete next step. That was right in 13B and it is
 * unchanged.
 *
 * WHAT CHANGED: it is in the 15A/15B system rather than the old light one, and
 * it now offers a second way out. A single "Try again" button on a page that
 * just failed to load is a loop when the thing that failed is deterministic —
 * the home link is the exit.
 *
 * `digest` is logged rather than shown. A visitor cannot do anything with a
 * hash and printing one turns a recoverable moment into something that looks
 * like a crash report.
 */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[public/error]', error);
  }, [error]);

  return (
    <>
      <GradientField />
      <div className="st-state">
        <p className="st-code">Something went wrong</p>
        <h1>That didn&apos;t load right.</h1>
        <p>Nothing you entered was lost. Try it again — it usually works.</p>
        <div className="st-links">
          <button type="button" onClick={reset} className="n15-btn n15-btn-primary">
            Try again
          </button>
          <Link href="/" className="n15-btn n15-btn-ghost">
            Back to home
          </Link>
        </div>
      </div>
    </>
  );
}
