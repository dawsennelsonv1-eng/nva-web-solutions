'use client';

import { useEffect, useState } from 'react';

/**
 * components/site/HeroCycle.tsx — Phase 15A, Part 3: the type animation.
 *
 * Three messages. Each writes in, holds, retracts, and the next writes in.
 *
 * NO LAYOUT SHIFT, BY CONSTRUCTION:
 * - The server renders message one COMPLETE. It is in the initial HTML, so
 *   the largest text on the page paints on first paint with the preloaded
 *   serif — that full line is the LCP candidate, and it never re-renders
 *   before hydration.
 * - .hero-line (phase15a.css) reserves the full wrapped height, so the CTA
 *   below never moves while lines write and retract.
 *
 * REDUCED MOTION: the effect checks the media query and simply never starts.
 * The visitor keeps the complete first message, static — a finished state,
 * not a degraded one.
 *
 * ACCESSIBILITY: the cycling span is aria-hidden; screen readers get all
 * three messages once, as one static visually-hidden sentence. No live
 * region, no strobing announcements.
 *
 * BACKGROUND TABS: browsers throttle timers in hidden tabs, so the cycle
 * slows to a crawl on its own; state is sequential, so it resumes cleanly.
 *
 * ---------------------------------------------------------------------------
 * BUILD FIX (this file only). The first push failed type-check at line 65:
 *   Type error: 'current' is possibly 'undefined'.
 *
 * CAUSE: this repo's tsconfig has `noUncheckedIndexedAccess` enabled, which
 * makes EVERY array index return `T | undefined` — including `MESSAGES[0]`,
 * where the value obviously exists. It is a real setting doing its job; the
 * three indexed reads that were here (lines 42, 64, 72) were all unsound
 * under it, and tsc only reported the first.
 *
 * FIX: the messages are now named constants, and `messageAt()` is the single
 * accessor — it returns a plain `string`, so nothing downstream is nullable.
 * The `?? M1` is not defensive padding for a case that can happen; it is how
 * the accessor proves to the compiler that it always returns a string.
 *
 * FOR FUTURE PHASES: assume `noUncheckedIndexedAccess`. Never index an array
 * with a variable and use the result directly.
 * ------------------------------------------------------------------------ */

const M1 = 'Turn your website into a quoting machine.';
const M2 = 'Your customer gets a price in under a minute.';
const M3 = 'They see their floor before they ever call.';

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
