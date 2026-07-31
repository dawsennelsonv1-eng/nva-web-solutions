'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * components/marketing/useInViewport.ts — shared pause-when-hidden logic
 * for every "Infinite Motion" section (spec hard limit: GPU-composited,
 * paused off-screen and when the tab is hidden).
 *
 * Two independent signals, both required for `active`:
 *   - IntersectionObserver: is this element anywhere near the viewport?
 *     (rootMargin gives it a head start so motion is already running the
 *     instant it scrolls into view, rather than popping in.)
 *   - document.visibilityState: is the TAB itself visible? A section can be
 *     scrolled into view in a backgrounded tab (e.g. restored from a tab
 *     switcher) — visibility alone doesn't catch that IntersectionObserver
 *     keeps reporting "intersecting" for an element in a hidden tab.
 * A backgrounded animation is pure wasted CPU/battery on exactly the mid-
 * range Android this build is tuned for, for zero visible benefit.
 */
export function useInViewport<T extends HTMLElement>(): {
  ref: React.RefObject<T>;
  active: boolean;
} {
  const ref = useRef<T>(null);
  const [intersecting, setIntersecting] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIntersecting(true); // no observer support: fail open rather than never-animate
      return;
    }
    const obs = new IntersectionObserver(([entry]) => setIntersecting(Boolean(entry?.isIntersecting)), {
      rootMargin: '150px 0px',
      threshold: 0.05,
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState === 'visible');
    onVis();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return { ref, active: intersecting && tabVisible };
}
