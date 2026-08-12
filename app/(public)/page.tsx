import type { Metadata } from 'next';
import { GradientField } from '@/components/site/GradientField';
import { Hero } from '@/components/site/Hero';
import { WhyUs } from '@/components/site/WhyUs';
import { ToolDeck } from '@/components/site/ToolDeck';
import { AiImplementation } from '@/components/site/AiImplementation';
import { ProofOfOperation } from '@/components/site/ProofOfOperation';
import { ProblemIntake } from '@/components/site/ProblemIntake';
import { Faq, Integration } from '@/components/site/Sections';

/**
 * app/(public)/page.tsx — PHASE 15B.
 *
 * THE LEGACY SLAB IS GONE. 15A parked everything below the hero on an explicit
 * `.bg-concrete` wrapper because those sections still wore the old light system
 * and their ink text would have vanished against the dark field. They are all
 * restyled now, so the wrapper is removed and the gradient field runs behind
 * the entire document, uninterrupted, from the hero to the footer. The visible
 * seam 15A accepted for one deploy is closed.
 *
 * PHASE 16A — WHAT LEFT THIS PAGE, AND WHERE IT WENT
 *
 *   Terms      deleted from Sections.tsx. It lives on /terms, which the footer
 *              already links to. Two copies of a promise is how a promise
 *              starts to drift.
 *   Machinery  still exported from Sections.tsx, no longer mounted here. The
 *              published pricing model is specific to ONE tool, and this page
 *              is becoming the front of a marketplace for nineteen of them.
 *
 * READ THIS: Machinery currently renders NOWHERE. The epoxy product page that
 * is meant to carry it does not exist yet. Until it does, the published
 * arithmetic — which is the single strongest trust argument on this site — is
 * not visible to anybody. If the product page slips, put <Machinery /> back on
 * this page rather than leaving it dark; the component is untouched and the
 * import is one line.
 *
 * ORDER: Why us under the hero, then the tool deck, then the AI implementation
 * positioning, then what was already here. Showcase is replaced by ToolDeck.
 *
 * PHASE 16B-2 adds ProblemIntake, placed AFTER the proof section and BEFORE the
 * FAQ. That position is deliberate: by then a visitor whose trade is not the
 * one running tool has read everything this page can offer him and has nothing
 * left to click. Asking him what is broken in his business is the most useful
 * thing on the page for that reader, and it is the last thing before the
 * questions section that exists for people who already know what they want.
 *
 * Showcase.tsx and MiniPricer.tsx are NO LONGER IMPORTED BY THIS FILE. They are
 * not deleted and not edited — I can only see the files pasted into this phase,
 * and either may be mounted somewhere I cannot see. Grep the repo before
 * removing them:
 *   grep -rn "Showcase\|MiniPricer" app components lib
 *
 * STILL FULLY STATIC. Every section is a server component. ToolDeck and
 * ProofOfOperation each read the database, so this route is dynamic where 15A
 * left it static — that is the cost of the tool cards being reconciled against
 * the registry at request time rather than hardcoded, and it is the same trade
 * the Showcase section already made.
 */

export const maxDuration = 300;

export const metadata: Metadata = {
  title: 'Girder — instant quotes and AI tools for your trade',
  description:
    'Your customer gets a price in under a minute — and sees their floor before they call. Quoting tools, visualizers, and custom software from NVA.',
  openGraph: {
    title: 'Girder — instant quotes and AI tools for your trade',
    description:
      'Your customer gets a price in under a minute — and sees their floor before they call.',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Girder' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Girder — instant quotes and AI tools for your trade',
    description:
      'Your customer gets a price in under a minute — and sees their floor before they call.',
    images: ['/og.png'],
  },
};

export default function HomePage() {
  return (
    <>
      <GradientField />
      <Hero />
      <WhyUs />
      <ToolDeck />
      <AiImplementation />
      <Integration />
      <ProofOfOperation />
      <ProblemIntake />
      <Faq />
    </>
  );
}
