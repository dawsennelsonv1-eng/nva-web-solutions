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
 */

const MESSAGES = [
  'Turn your website into a quoting machine.',
  'Your customer gets a price in under a minute.',
  'They see their floor before they ever call.',
];

const TYPE_MS = 46; // per character, writing
const ERASE_MS = 22; // per character, retracting
const HOLD_MS = 2400; // full message on screen
const GAP_MS = 350; // empty beat between messages

export function HeroCycle() {
  const [text, setText] = useState(MESSAGES[0]);
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
        const current = MESSAGES[i];
        for (let n = current.length - 1; alive && n >= 0; n--) {
          setText(current.slice(0, n));
          await wait(ERASE_MS);
        }
        if (!alive) break;
        await wait(GAP_MS);
        i = (i + 1) % MESSAGES.length;
        const next = MESSAGES[i];
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
        Turn your website into a quoting machine. Your customer gets a price in
        under a minute. They see their floor before they ever call.
      </span>
      <span className="hero-line" aria-hidden="true">
        {text}
        {caret && <span className="hero-caret" />}
      </span>
    </>
  );
}
