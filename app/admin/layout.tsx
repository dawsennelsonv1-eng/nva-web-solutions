import type { ReactNode } from 'react';
import { MotionProvider } from '@/lib/motion';
import { GradientField } from '@/components/site/GradientField';

/**
 * app/admin/layout.tsx — THE OPERATOR SCREENS FINALLY HAVE A SHELL.
 *
 * ============================================================================
 * WHY THESE PAGES LOOKED UNSTYLED, AND WHY YOU COULD NOT FIND THEM
 * ============================================================================
 *
 * There are two admin trees in this app and only one of them had a layout.
 *
 *   app/(admin)/admin/*   dash, leads, prospects, pricing, billing, queue,
 *                         combiner. Wrapped by app/(admin)/layout.tsx, which
 *                         supplies a header, a sign-out button and a nav bar.
 *
 *   app/admin/*           ai, appearance, finishes, media, payments — and now
 *                         swatches. NO LAYOUT AT ALL. These pages inherited
 *                         only app/layout.tsx, which is the bare <html> shell.
 *
 * TWO CONSEQUENCES, and between them they are the whole complaint:
 *
 *   1. NOTHING LINKED TO THEM. The nav in app/(admin)/layout.tsx lists Dash,
 *      Leads, Prospects, Pricing and Billing. It has never mentioned media,
 *      finishes, appearance, payments or ai. Six operator screens existed and
 *      the only way to reach any of them was to know the URL and type it. That
 *      is why there appeared to be "no spot to upload or generate pictures" —
 *      the spot existed and was unreachable.
 *
 *   2. THEY WORE THE OLD DESIGN SYSTEM. Their markup uses font-display,
 *      text-rule, bg-sheet — the pre-phase-15 vocabulary. The n15 layers are
 *      global, so the fonts and the gradient field were available the whole
 *      time; these pages simply never used any of it. With no layout there was
 *      no MotionProvider and no GradientField either, so they rendered on flat
 *      nothing while every public page sat on the drifting gradient.
 *
 * This layout fixes both without touching a single existing page: it supplies
 * the field, the container, the type and the navigation, and the pages render
 * inside it exactly as they are. Their internal markup can be migrated to n15
 * class by class later, or never — they already look like part of the product
 * from the outside.
 *
 * ============================================================================
 * IT DOES NOT GATE ANYTHING, AND MUST NOT PRETEND TO
 * ============================================================================
 *
 * middleware.ts gates every page under /admin/* by URL, which covers both
 * trees — lib/auth/admin.ts states this directly. This layout is presentation.
 * Adding a requireAdmin() check here would look like defence and would be
 * defence in the wrong place: a layout can render before it resolves, and the
 * actions behind these screens each check for themselves, which is where the
 * check belongs.
 */

const SCREENS: readonly { href: string; label: string; note: string }[] = [
  {
    href: '/admin/swatches',
    label: 'Swatches',
    note: 'Generate a photograph for each finish with AI',
  },
  {
    href: '/admin/combinations',
    label: 'Combinations',
    note: 'Render every mix onto one garage floor',
  },
  { href: '/admin/finishes', label: 'Finishes', note: 'Upload and manage finish pictures' },
  { href: '/admin/media', label: 'Tool media', note: 'Recordings on each tool page' },
  { href: '/admin/appearance', label: 'Appearance', note: 'Colours and branding' },
  { href: '/admin/payments', label: 'Payments', note: 'Providers and checkout' },
  { href: '/admin/ai', label: 'AI', note: 'Model spend and the job ledger' },
];

export default function OperatorLayout({ children }: { children: ReactNode }) {
  return (
    <MotionProvider>
      {/*
        The same drifting field the public site sits on. DemoExperience renders
        at opacity 0 outside a MotionProvider with no console error, and any
        motion-driven admin component would do the same — so the provider is
        here whether or not today's pages need it.
      */}
      <GradientField />

      <div className="n15-sec" style={{ paddingTop: '2.5rem', paddingBottom: '3rem' }}>
        <div className="n15-in">
          <p className="n15-eyebrow">Operator</p>

          {/*
            Every screen, every time, with a sentence saying what it is for.
            A bare list of six nouns is what the (admin) nav already does and it
            is why nobody knew `finishes` was where swatches are uploaded.
          */}
          <nav
            aria-label="Operator screens"
            style={{
              display: 'grid',
              gap: '0.6rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
              marginTop: '1rem',
              marginBottom: '2.5rem',
            }}
          >
            {SCREENS.map((s) => (
              <a
                key={s.href}
                href={s.href}
                className="n15-btn n15-btn-ghost"
                style={{
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  minHeight: '4rem',
                  padding: '0.7rem 1rem',
                  borderRadius: 'var(--n15-r-inner)',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontWeight: 600 }}>{s.label}</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.6, letterSpacing: 0 }}>
                  {s.note}
                </span>
              </a>
            ))}
          </nav>

          {children}

          <p style={{ marginTop: '3rem', fontSize: '0.8rem', opacity: 0.5 }}>
            {/* NOT `.n15-link` — that class does not exist. Grepped
                globals.css and phase15b.css before writing this; the system
                has .n15-btn, .n15-eyebrow, .n15-h2, .n15-h3, .n15-in and
                .n15-sec, and no link utility. A className that matches nothing
                renders as unstyled blue-underline default and looks like a
                bug, so this is styled inline instead of inventing one. */}
            <a href="/admin" style={{ color: 'var(--n15-copper)' }}>
              Back to the admin dashboard
            </a>
          </p>
        </div>
      </div>
    </MotionProvider>
  );
}
