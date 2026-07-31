'use client';

import { useEffect, useRef } from 'react';

/**
 * components/widget/PriceSpan.tsx — the price range rendered as a SPAN on the
 * same rule the area was measured with.
 *
 * A range is a distance, so it is drawn as one: two graduation marks joined by
 * a machined bracket, with the figures set beneath their own marks. It is
 * deliberately not "$3,069 – $4,152" in a rounded card, because that is what
 * every estimate widget on the internet already looks like, and because a
 * contractor reading a bracketed span understands instantly that the number is
 * a tolerance rather than a promise.
 *
 * THE NUMBERS ANIMATE AS NUMBERS. Each figure counts from its previous value
 * to its next one inside a requestAnimationFrame loop that writes textContent
 * directly. React never re-renders during the count, so the digits do not
 * reflow and the tabular figures hold their column. Under
 * prefers-reduced-motion the count is skipped entirely and the figures simply
 * set — which is why --t-span exists as a token rather than a literal.
 */

export interface PriceSpanProps {
  lowCents: number;
  highCents: number;
  /** Blur the figures until the lead form is completed (step 4 paywall). */
  obscured?: boolean;
  /** Where the span sits within the widget's own scale, 0-100. */
  originPct?: number;
  endPct?: number;
}

function useCountTo(target: number, ref: React.RefObject<HTMLSpanElement>) {
  const prev = useRef(target);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = prev.current;
    prev.current = target;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const render = (cents: number) => {
      el.textContent = '$' + Math.round(cents / 100).toLocaleString('en-US');
    };
    if (reduced || from === target) {
      render(target);
      return;
    }

    const duration = 240; // --t-span
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic: the figure decelerates into place like a needle
      const eased = 1 - Math.pow(1 - t, 3);
      render(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ref]);
}

export function PriceSpan({
  lowCents,
  highCents,
  obscured = false,
  originPct = 12,
  endPct = 88,
}: PriceSpanProps) {
  const lowRef = useRef<HTMLSpanElement>(null);
  const highRef = useRef<HTMLSpanElement>(null);
  useCountTo(lowCents, lowRef);
  useCountTo(highCents, highRef);

  return (
    <div className="w-full">
      <div className="relative h-16" aria-hidden>
        {/* the bracket */}
        <div
          className="absolute top-0 transition-[left,right] duration-span ease-out"
          style={{ left: originPct + '%', right: 100 - endPct + '%' }}
        >
          <div className="relative h-4">
            <div className="absolute left-0 top-0 h-4 w-0.5 bg-ink" />
            <div className="absolute right-0 top-0 h-4 w-0.5 bg-ink" />
            <div className="absolute left-0 right-0 top-0 h-px bg-ink" />
          </div>
        </div>
        {/* the figures, set under their own marks */}
        <div
          className="absolute top-5 transition-[left,right] duration-span ease-out"
          style={{ left: originPct + '%', right: 100 - endPct + '%' }}
        >
          <div className="flex items-start justify-between">
            <div className="-translate-x-1/2 text-left">
              <span
                ref={lowRef}
                className={
                  'tabular block font-display font-condensed text-2xl font-bold leading-none' +
                  (obscured ? ' select-none blur-[7px]' : '')
                }
              >
                {'$' + Math.round(lowCents / 100).toLocaleString('en-US')}
              </span>
              <span className="mt-1 block font-data text-xs uppercase tracking-wide text-rule">low</span>
            </div>
            <div className="translate-x-1/2 text-right">
              <span
                ref={highRef}
                className={
                  'tabular block font-display font-condensed text-2xl font-bold leading-none' +
                  (obscured ? ' select-none blur-[7px]' : '')
                }
              >
                {'$' + Math.round(highCents / 100).toLocaleString('en-US')}
              </span>
              <span className="mt-1 block font-data text-xs uppercase tracking-wide text-rule">high</span>
            </div>
          </div>
        </div>
      </div>
      {/* Screen readers get the figures as text, never as a blurred image. */}
      <p className="sr-only">
        {obscured
          ? 'Estimated price range is hidden until you enter your details.'
          : 'Estimated between $' +
            Math.round(lowCents / 100).toLocaleString('en-US') +
            ' and $' +
            Math.round(highCents / 100).toLocaleString('en-US')}
      </p>
    </div>
  );
}
