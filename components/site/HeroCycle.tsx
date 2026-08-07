'use client';

import { useEffect, useState } from 'react';

/**
 * components/site/HeroCycle.tsx — the type animation. PHASE 16A-2.
 *
 * ============================================================================
 * THE THREE LINES ARE NOW GENERIC. THAT IS THE WHOLE CHANGE.
 * ============================================================================
 *
 * 15A's three were written when this was one product for one trade:
 *   "Turn your website into a quoting machine."
 *   "Your customer gets a price in under a minute."
 *   "They see their floor before they ever call."
 *
 * The third names a floor. The first names quoting. This page is now the front
 * of a marketplace of tools for many trades, and the first thing a visitor
 * reads should not narrow the business to one of them.
 *
 * The replacements say what we do at the level of the company, and they are
 * ordered so the broadest claim is first — because the first line is the one
 * that is server-rendered and the one most visitors will read before the cycle
 * ever starts.
 *
 * STILL AIMED AT THE FLOOR GUY. Generic in scope does not mean bland. "How your
 * trade works" and "an answer in under a minute" are true of nineteen trades
 * while still describing exactly the epoxy contractor's Tuesday. Nothing here
 * says platform, solution, leverage, or unlock.
 *
 * ============================================================================
 * EVERYTHING ELSE IS UNCHANGED, AND DELIBERATELY SO
 * ============================================================================
 *
 * NO LAYOUT SHIFT, BY CONSTRUCTION:
 * - The server renders message one COMPLETE. It is in the initial HTML, so the
 *   largest text on the page paints on first paint with the preloaded serif —
 *   that full line is the LCP candidate, and it never re-renders before
 *   hydration.
 * - .hero-line (phase15a.css) reserves the full wrapped height, so the CTA
 *   below never moves while lines write and retract.
 *
 * LENGTH IS A CONSTRAINT HERE, NOT A STYLE CHOICE. The height reservation in
 * phase15a.css was measured against 15A's strings, whose longest was 45
 * characters. The first draft of these three ran to 57, which at 360px is very
 * likely an extra wrapped line — and an extra line means the CTA hops every
 * time the cycle turns over, on the largest element on the page.
 *
 * So all three are held at or under 45 characters (longest: 41). Keep any
 * future line under that ceiling, or re-measure the reservation in
 * phase15a.css first. This is the cheapest possible place to cause layout
 * shift and the most expensive place to have it.
 *
 * REDUCED MOTION: the effect checks the media query and never starts. The
 * visitor keeps the complete first message, static — a finished state, not a
 * degraded one.
 *
 * ACCESSIBILITY: the cycling span is aria-hidden; screen readers get all three
 * messages once, as one static visually-hidden sentence. No live region, no
 * strobing announcements.
 *
 * BACKGROUND TABS: browsers throttle timers in hidden tabs, so the cycle slows
 * on its own; state is sequential, so it resumes cleanly.
 *
 * `noUncheckedIndexedAccess` IS ON. Every array index returns `T | undefined`,
 * including MESSAGES[0]. That is why the strings are named constants and why
 * messageAt() is the single accessor — the `?? M1` is not defensive padding for
 * a case that can happen, it is how the accessor proves to the compiler that it
 * always returns a string. Never index an array with a variable and use the
 * result directly.
 */

const M1 = 'We build AI into your business.';
const M2 = 'Tools made for how your trade works.';
const M3 = 'Your customer gets an answer in a minute.';

const MESSAGES: readonly string[] = [M1, M2, M3];

/** The only way this file reads MESSAGES. Always returns a string. */
function messageAt(index: number): string {
  return MESSAGES[index] ?? M1;
}

const TYPE_MS = 46; // per character, writing
const ERASE_MS = 22; // per character, retracting
const HOLD_MS = 2400; // full message on screen
const GAP_MS = 350; // empty beat between messages

export function HeroCycle() {
  const [text, setText] = useState<string>(M1);
  const [caret, setCaret] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    let alive = true;
    let timer = 0;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = window.setTimeout(resolve, ms);
      });

    setCaret(true);

    (async () => {
      let i = 0;
      // Message one is already fully on screen from the server: hold it a
      // little longer than the normal beat before the first retraction.
      await wait(HOLD_MS + 900);
      while (alive) {
        const current = messageAt(i);
        for (let n = current.length - 1; alive && n >= 0; n--) {
          setText(current.slice(0, n));
          await wait(ERASE_MS);
        }
        if (!alive) break;
        await wait(GAP_MS);
        i = (i + 1) % MESSAGES.length;
        const next = messageAt(i);
        for (let n = 1; alive && n <= next.length; n++) {
          setText(next.slice(0, n));
          await wait(TYPE_MS);
        }
        await wait(HOLD_MS);
      }
    })();

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <span className="sr15a">
        {M1} {M2} {M3}
      </span>
      <span className="hero-line" aria-hidden="true">
        {text}
        {caret && <span className="hero-caret" />}
      </span>
    </>
  );
}
