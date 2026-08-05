import type { Metadata } from 'next';
import Link from 'next/link';
import { CalibrationCheck } from '@/components/site/CalibrationCheck';
import { ProofOfOperation } from '@/components/site/ProofOfOperation';
import { Showcase } from '@/components/site/Showcase';
import { Faq, Integration, Machinery, Terms } from '@/components/site/Sections';
import { Plate } from '@/components/ui/Plate';
import { liveInstalls } from '@/lib/site/metrics';

/**
 * app/(public)/page.tsx — THE PUBLIC HOMEPAGE.
 *
 * The entire page is a frame around one interaction: a contractor running a
 * job he has already completed through the live pricing engine. Everything
 * below the hero exists to get him to touch it, or to answer the question he
 * has immediately after he does.
 *
 * Order: hero (the instrument) -> showcase (the other things it drives, as
 * things he can touch) -> integration (kills "I can't code") -> machinery (the
 * model itself, because a man sold to badly is starved of anyone showing him
 * how the thing works) -> proof of operation (counted, not claimed) -> terms
 * (where the badge row would have gone) -> FAQ.
 *
 * THE SHOWCASE SITS SECOND, DIRECTLY UNDER THE HERO, and that placement is the
 * decision. A visitor who has just dragged a rule and watched a garage floor
 * price itself has exactly one question — "does it do MY trade" — and the
 * showcase plus the queue strip is the answer to it. Putting Integration there
 * instead answers a question he has not asked yet.
 *
 * THE HEADLINE CONTAINS A REAL NUMBER AND DOES NOT MOVE. No typewriter, no
 * reveal, no fade. It is set once, it is the largest thing on the page, and it
 * is in the initial HTML.
 *
 * NOTHING ON THIS PAGE OBSERVES SCROLL. There is no IntersectionObserver, no
 * stagger, no parallax, and no hover-lift anywhere in the tree. The motion
 * added in 13D is confined to the pricing engine demonstrating itself — see
 * CalibrationCheck and MiniPricer.
 */

export const metadata: Metadata = {
  title: 'Girder — the quoting system a franchise sells for $49,500',
  description:
    'Put a job you have already done through the live pricing engine and check the number yourself. $500 setup, $250 a month, 0% of your revenue.',
  openGraph: {
    title: 'Girder — the quoting system a franchise sells for $49,500',
    description:
      'Run a job you have already done through the live engine and check the number yourself.',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Girder' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Girder — the quoting system a franchise sells for $49,500',
    description:
      'Run a job you have already done through the live engine and check the number yourself.',
    images: ['/og.png'],
  },
};

export default async function HomePage() {
  // The hero Plate carries a live count, so it is counted, not written down.
  // If the database cannot be reached the Plate is omitted entirely rather
  // than rendered with a number nobody verified.
  const installs = await liveInstalls();

  return (
    <>
      {/* HERO. Deliberately compact: the input panel must be reachable without
          scrolling on a 360px screen, so the headline is two lines and there
          is no sub-headline paragraph competing for the fold. */}
      <section className="bg-concrete px-4 pb-12 pt-6" aria-labelledby="hero-h">
        <div className="mx-auto max-w-5xl">
          {installs && (
            <Plate
              unit="NVA-EPX-01"
              status="IN SERVICE"
              rev={12}
              date="2026-08"
              count={{ label: installs.label, value: installs.value }}
            />
          )}

          <h1
            id="hero-h"
            className="mt-4 max-w-[18ch] font-display text-display font-extrabold uppercase"
          >
            A franchise charges $49,500 for this part
          </h1>

          <p className="mt-3 max-w-[54ch] text-base">
            Put in a floor you have already done. The engine below is the live one, running real
            rates, and it will show you the range your customer would have been given — and every
            line that produced it.
          </p>

          <div className="mt-5 max-w-xl">
            <CalibrationCheck />
          </div>

          <p className="mt-3 max-w-[54ch] text-sm text-rule">
            $500 to set up, $250 a month, and we take none of the job. No call booked, no email
            asked for.
          </p>

          {/* THE PERSISTENT NICHE ENTRY POINT (13D Part 4.3).
              A text link on a rule, not a button and not a banner. A man whose
              trade is not epoxy needs a way out of this hero within one screen
              of arriving, and he needs it before he concludes the whole site is
              about garage floors. It is set in mono at the small step so it
              reads as a wayfinding mark on an instrument rather than a second
              call to action competing with the widget above it — the single
              hazard action per viewport is already spent inside the widget. */}
          <p className="mt-4 border-t border-rule pt-3">
            <Link
              href="/categories"
              className="font-data text-2xs uppercase tracking-[0.08em] text-ink underline underline-offset-4"
            >
              Not epoxy? Check for tools in my niche →
            </Link>
          </p>
        </div>
      </section>

      <Showcase />
      <Integration />
      <Machinery />
      <ProofOfOperation />
      <Terms />
      <Faq />
    </>
  );
}
