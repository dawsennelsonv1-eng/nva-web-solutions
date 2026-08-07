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

/**
 * ============================================================================
 * ONE "SIGN IN" LINK SERVES BOTH SIGNED-IN AND SIGNED-OUT VISITORS
 * ============================================================================
 *
 * There is no session check in this component and none is needed. middleware.ts
 * already bounces an authenticated user from /login straight to /app, so a
 * stranger who taps Sign in gets the form and a contractor who taps it lands on
 * his own dashboard.
 *
 * Worth stating plainly, because the obvious implementation — read the session,
 * swap the label between "Sign in" and "My account" — would mean threading a
 * server-side auth read through app/(public)/layout.tsx into a client component
 * on every public page, to change one word. The routing already does the work.
 *
 * ============================================================================
 * "GET STARTED" IS THE SIGN-UP, AND IT IS DELIBERATELY NOT A SUPABASE FORM
 * ============================================================================
 *
 * There is no /signup route in this codebase and that reads as a decision
 * rather than a gap. An account here is not a thing you create — it is a thing
 * that exists because a `companies` row and a `company_members` row were
 * created for you. lib/auth/member.ts is explicit that a signed-in user with no
 * membership is "a real person whose invite has not been accepted": an anomaly,
 * handled as a support problem.
 *
 * A self-serve email/password form would manufacture exactly that anomaly. The
 * visitor would sign up successfully, land on /app, and be told no company is
 * attached to his account — working software delivering a dead end, on the
 * first screen he sees after trusting us with an email address.
 *
 * It is also a tenancy decision I am not entitled to make alone. Letting an
 * anonymous visitor create a `companies` row changes who can bootstrap a
 * tenant, and 0014_companies.sql was written on the assumption that they
 * cannot.
 *
 * So Get started points at /start, the questionnaire. For this business that
 * genuinely IS the sign-up: he answers five short questions, the branded
 * version gets built, and his account is created with a company attached when
 * he is onboarded. If self-serve accounts are ever wanted, that is its own
 * phase with its own migration — not a link in a menu.
 */
const NAV = [
  { href: '/', label: 'Home' },
  { href: '/categories', label: 'Categories' },
  { href: '/queue', label: 'Build queue' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/demo', label: 'Demo' },
];

/** Account actions. Separated from NAV at both breakpoints. */
const ACCOUNT = [
  { href: '/login', label: 'Sign in' },
  { href: '/start', label: 'Get started' },
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
            <span aria-hidden className="hd-sep" />
            <Link href="/login">Sign in</Link>
            <Link href="/start" className="hd-cta">
              Get started
            </Link>
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

          {/* Bottom-weighted below the rest. These are the two rows a thumb
              should reach first on a large phone held one-handed, which is the
              same reason the whole panel is justified to the end. */}
          <div className="hd-account">
            {ACCOUNT.map((a) => (
              <Link key={a.href} href={a.href} onClick={() => setOpen(false)}>
                {a.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}
