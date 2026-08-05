'use client';

import { useEffect, useRef } from 'react';

/**
 * components/site/CountingFigure.tsx — a dollar figure that changes as a
 * NUMBER rather than as a re-render.
 *
 * ============================================================================
 * WHY THIS EXISTS WHEN components/widget/PriceSpan.tsx ALREADY COUNTS
 * ============================================================================
 *
 * PriceSpan does the same arithmetic, and duplicating ~40 lines is a real
 * cost, so this is a deliberate choice rather than an oversight.
 *
 *  1. TYPEFACE. PriceSpan sets its figures in `font-display font-condensed`,
 *     which resolves to archivo-700-cond.woff2. That face is explicitly NOT
 *     preloaded (app/layout.tsx: only three of five faces are, to keep 60 KB
 *     of competing requests out of the LCP path). Inside the widget modal that
 *     is correct — it is behind an interaction, the font has long since
 *     arrived. In the hero it would mean the largest number above the fold
 *     swaps typeface mid-paint on a cold 4G load. This component uses the
 *     preloaded 800 weight instead.
 *
 *  2. COUPLING. PriceSpan is mounted by /demo and /s/[slug] — a paying
 *     contractor's installed widget. Reaching into it to add a hero-only prop
 *     puts the homepage's needs inside a file that renders on customer sites.
 *     That trade is not worth 40 lines.
 *
 *  3. THE DRAG CASE, which PriceSpan has no notion of. See below.
 *
 * ============================================================================
 * `animate` — AND WHY COUNTING IS SOMETIMES WRONG
 * ============================================================================
 *
 * When a finish is tapped, the figure counting to its new value is the product
 * demonstrating that something recalculated. Good.
 *
 * When the square-footage rule is being DRAGGED, counting is actively wrong.
 * The target moves every frame, so each frame would restart a 240ms ease-out
 * toward a value that is already stale — the figure would trail the thumb by a
 * quarter-second and never settle while the finger is down. The instrument
 * would feel like it was guessing.
 *
 * So during direct manipulation `animate` is false and the figure is written
 * immediately, tracking the thumb exactly. The number still moves continuously
 * — it moves because he is moving it. That is the same distinction DatumRule's
 * own header draws about its indicator, and it resolves the same way.
 *
 * ============================================================================
 * NO LAYOUT SHIFT
 * ============================================================================
 *
 * Writing `textContent` inside a rAF loop means React never re-renders during
 * the count — no reconciliation, no diff, no chance of the surrounding layout
 * being touched. The caller pairs this with `.tabular` (font-variant-numeric:
 * tabular-nums) so every digit occupies one column width and "$1,000" is
 * exactly as wide as "$8,888". Without tabular figures the count would visibly
 * shudder as proportional digits changed width, which is the specific failure
 * that makes counting numbers look cheap.
 */

export interface CountingFigureProps {
  cents: number;
  /** False during direct manipulation — write immediately, do not interpolate. */
  animate?: boolean;
  className?: string;
}

/** Whole dollars, grouped. Matches wholeDollars() in lib/site/reference-rates. */
function render(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

export function CountingFigure({ cents, animate = true, className = '' }: CountingFigureProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(cents);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const from = prev.current;
    prev.current = cents;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!animate || reduced || from === cents) {
      el.textContent = render(cents);
      return;
    }

    // 240ms = --t-span. Read as a literal here because this runs in JS, not
    // CSS; the token is the source of truth and this must be changed with it.
    const duration = 240;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic: the figure decelerates into place like a needle
      // settling, rather than arriving at constant speed and stopping dead.
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = render(from + (cents - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [cents, animate]);

  // The initial value is in the server-rendered HTML, so the figure is
  // correct before hydration and never flashes a zero.
  return (
    <span ref={ref} className={`tabular ${className}`}>
      {render(cents)}
    </span>
  );
}
