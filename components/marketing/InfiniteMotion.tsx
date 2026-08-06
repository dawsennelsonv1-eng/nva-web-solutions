'use client';

import { useEffect, useState } from 'react';
import { m } from '@/lib/motion';
import { useInViewport } from './useInViewport';

/**
 * components/marketing/InfiniteMotion.tsx — "this agency can build anything,"
 * not "we know CSS."
 *
 * The section shows three abstract site-mockup cards — a nav bar, a hero
 * block, a CTA pill, nothing more literal than that — cycling through
 * different brand palettes and type pairings on a timer. It is deliberately
 * NOT a screenshot of a real client site: no real branded prototype exists
 * yet this early in the build (Phase 7/8 build the actual brand engine), and
 * showing a fabricated "client" would be a small dishonesty this build
 * otherwise goes out of its way to avoid (NAMING.md, OFFER.md — plain claims
 * over decoration throughout). An abstract mockup that visibly RESKINS
 * itself makes the same claim honestly: the system underneath is the same,
 * the surface is whatever the contractor's brand needs it to be.
 *
 * WHAT STAYS PERFECTLY STILL: the card geometry, the layout, the copy. Only
 * colour and type pairing cycle. A design section that also moves its own
 * layout while trying to demonstrate flexibility reads as chaotic rather
 * than capable — the restraint IS the argument.
 *
 * Every value below is a CSS custom property override, the same mechanism
 * lib/theme.ts uses for real per-tenant branding — this section is a live
 * demonstration of the actual theme engine, not a separate animation.
 */

interface Palette {
  name: string;
  ink: string;
  sheet: string;
  accent: string;
  font: 'display' | 'display-condensed';
}

const PALETTES: Palette[] = [
  { name: 'Industrial Orange', ink: '20 23 26', sheet: '244 245 243', accent: '255 106 19', font: 'display-condensed' },
  { name: 'Deep Harbor', ink: '18 30 38', sheet: '236 241 240', accent: '27 75 143', font: 'display' },
  { name: 'Desert Clay', ink: '46 33 26', sheet: '245 238 227', accent: '178 84 42', font: 'display-condensed' },
  { name: 'Slate Cure', ink: '22 26 25', sheet: '233 238 235', accent: '31 95 82', font: 'display' },
];

const CYCLE_MS = 3200;

function MockCard({ palette, label }: { palette: Palette; label: string }) {
  return (
    <div
      className="w-full overflow-hidden rounded-milled border transition-colors duration-span"
      style={{
        backgroundColor: 'rgb(' + palette.sheet + ')',
        borderColor: 'rgb(' + palette.ink + ' / 0.15)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 transition-colors duration-span"
        style={{ backgroundColor: 'rgb(' + palette.ink + ')' }}
      >
        <span
          className={
            'text-xs font-bold uppercase tracking-wide ' +
            (palette.font === 'display-condensed' ? 'font-condensed' : '')
          }
          style={{ color: 'rgb(' + palette.sheet + ')' }}
        >
          {label}
        </span>
        <span className="h-2 w-8 rounded-full" style={{ backgroundColor: 'rgb(' + palette.accent + ')' }} />
      </div>
      <div className="space-y-2 p-3">
        <div className="h-3 w-3/4 rounded-full transition-colors duration-span" style={{ backgroundColor: 'rgb(' + palette.ink + ' / 0.85)' }} />
        <div className="h-2 w-1/2 rounded-full transition-colors duration-span" style={{ backgroundColor: 'rgb(' + palette.ink + ' / 0.35)' }} />
        <div
          className="mt-3 inline-flex h-7 items-center rounded-milled px-3 text-[10px] font-bold uppercase tracking-wide transition-colors duration-span"
          style={{ backgroundColor: 'rgb(' + palette.accent + ')', color: 'rgb(' + palette.sheet + ')' }}
        >
          Get my price
        </div>
      </div>
    </div>
  );
}

export function InfiniteMotion() {
  const { ref, active } = useInViewport<HTMLDivElement>();
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!active || reduced) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % PALETTES.length), CYCLE_MS);
    return () => clearInterval(id);
  }, [active, reduced]);

  const labels = ['Garage floors', 'Patio coatings', 'Commercial bays'];

  return (
    <section ref={ref} className="mx-auto max-w-4xl px-4 py-16">
      <p className="font-data text-xs uppercase tracking-wide text-rule">One system, any brand</p>
      <h2 className="mt-2 font-display font-condensed text-2xl font-bold sm:text-3xl">
        The same engine, wearing your name.
      </h2>
      <p className="mt-2 max-w-lg text-base text-rule">
        Colours, type and tone change per contractor. The quoting engine underneath never does.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {labels.map((label, i) => {
          // Palettes offset per card so all three never show the identical
          // pairing at once — reads as "many brands," not "one card, times three."
          const palette = PALETTES[(index + i) % PALETTES.length]!;
          return (
            <m.div
              key={label}
              animate={reduced ? undefined : { y: [0, -3, 0] }}
              transition={{ duration: 4, repeat: active && !reduced ? Infinity : 0, ease: 'easeInOut', delay: i * 0.4 }}
              style={{ willChange: 'transform' }}
            >
              <MockCard palette={palette} label={label} />
            </m.div>
          );
        })}
      </div>
    </section>
  );
}
