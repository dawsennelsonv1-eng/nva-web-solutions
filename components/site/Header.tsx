'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * components/site/Header.tsx — 56px, fixed, opaque Machine Black.
 *
 * NO BACKDROP BLUR, and this is a functional decision rather than a taste one:
 * the stated viewing condition is a phone in a truck cab in daylight, where a
 * translucent bar is illegible, and backdrop-filter is expensive on the
 * mid-range Android the traffic arrives on. The class could not be written
 * anyway — `backdrop-blur-*` was deleted from the Tailwind theme in 13B.
 *
 * ============================================================================
 * 13D: THE NAV DEVIATION IS RESOLVED
 * ============================================================================
 *
 * 13B recorded a deviation here: the design called for Categories, and 13B
 * shipped Pricing and Demo instead because /categories did not exist and
 * linking to a 404 on a page whose argument is that it does not overstate what
 * exists would be self-defeating. That was the right call then.
 *
 * /categories exists now, so the link is honest and the deviation is closed.
 * Five items exactly, which is the ceiling.
 *
 * ============================================================================
 * THE MOBILE MENU
 * ============================================================================
 *
 * Full-screen, opaque, and reachable with a thumb. Three specifics:
 *
 *  1. OPAQUE, NOT A SHEET OVER THE PAGE. Same daylight argument as the bar
 *     itself. A menu you can read the page through is a menu you cannot read.
 *
 *  2. IT DOES NOT ANIMATE IN. No slide, no fade, no transition of any kind —
 *     it appears and it disappears. 13D permits motion that DEMONSTRATES THE
 *     PRODUCT; a drawer easing open demonstrates a drawer. The only motion on
 *     any control here is the 70ms press state, which is feedback rather than
 *     animation.
 *
 *  3. LINKS ARE BOTTOM-WEIGHTED. `justify-end` puts the tap targets in the
 *     lower half of a full-screen panel, where a thumb reaches on a phone held
 *     one-handed. A menu that opens from a bar at the top and then places its
 *     items at the top is unusable on a large phone without a second hand, and
 *     the stated test is one-handed at 360px. Each row is a full-width 60px
 *     target, well over the 44px minimum.
 *
 * The body does not get a scroll lock. The panel is fixed and covers the
 * viewport, so there is nothing behind it to scroll to, and locking the body
 * on iOS Safari is a well-known source of scroll-position bugs that would cost
 * more than it buys.
 */

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/categories', label: 'Categories' },
  { href: '/queue', label: 'Build queue' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/demo', label: 'Demo' },
];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 h-14 bg-ink text-sheet">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link
            href="/"
            className="font-display text-lg font-extrabold uppercase tracking-tight text-sheet"
          >
            Girder
          </Link>

          <nav className="hidden items-center gap-6 sm:flex" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-sm text-sheet">
                {n.label}
              </Link>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="press rounded-milled border border-rule px-3 py-1.5 text-sm text-sheet sm:hidden"
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </header>

      {/* Outside <header> so it can own the full viewport rather than hang off
          a 56px bar. z-40 puts it under the bar, which keeps Close reachable. */}
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="fixed inset-0 z-40 flex flex-col justify-end bg-ink px-4 pb-8 pt-16 sm:hidden"
        >
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="press flex min-h-[60px] items-center border-b border-rule font-display text-2xl font-extrabold uppercase text-sheet last:border-b-0"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
