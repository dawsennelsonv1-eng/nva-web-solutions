'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * components/site/Header.tsx — 56px, fixed, PHASE 15B type.
 *
 * STILL NO BACKDROP BLUR, and the reason has not changed since 13B: the stated
 * viewing condition is a phone in a truck cab in daylight, where a translucent
 * bar is illegible. It is also now the single most expensive thing that could
 * be added to a page holding a 60fps budget with a site gradient field, per-
 * card gradients and tilt all running — backdrop-filter forces the browser to
 * re-read and blur everything behind the bar on every frame the field drifts,
 * which is every frame. The bar is opaque and costs nothing.
 *
 * WHAT CHANGED: the wordmark and the mobile menu are set in the display serif,
 * the ink is 15A's warm off-white on the resin ground rather than Machine
 * Black and Ticket White, and the controls are pill-shaped. Nothing structural
 * moved.
 *
 * THE MOBILE MENU keeps all three of its 13D properties, each of which was
 * load-bearing rather than stylistic:
 *
 *  1. Opaque, not a sheet over the page. Same daylight argument as the bar.
 *  2. It does not animate in. It appears and it disappears. This phase permits
 *     motion, but a drawer easing open demonstrates a drawer — the motion
 *     budget on this page is spent on the cards, which demonstrate the product.
 *  3. Links are bottom-weighted. `justify-content: flex-end` puts the tap
 *     targets in the lower half of a full-screen panel, where a thumb reaches
 *     on a large phone held one-handed. Each row is a full-width 62px target.
 *
 * The body still gets no scroll lock: the panel is fixed and covers the
 * viewport, so there is nothing behind it to scroll to, and locking the body on
 * iOS Safari is a well-known source of scroll-position bugs.
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
      <header className="hd">
        <div className="hd-in">
          <Link href="/" className="hd-mark">
            Girder
          </Link>

          <nav className="hd-nav" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href}>
                {n.label}
              </Link>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="hd-toggle"
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </header>

      {/* Outside <header> so it can own the full viewport rather than hang off
          a 56px bar. Under the bar in z-order, which keeps Close reachable. */}
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="hd-panel">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)}>
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
