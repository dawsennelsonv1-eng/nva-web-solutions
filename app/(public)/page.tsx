import type { Metadata } from 'next';
import { GradientField } from '@/components/site/GradientField';
import { Hero } from '@/components/site/Hero';
import { WhyUs } from '@/components/site/WhyUs';
import { ToolDeck } from '@/components/site/ToolDeck';
import { AiImplementation } from '@/components/site/AiImplementation';
import { ProofOfOperation } from '@/components/site/ProofOfOperation';
import { Faq, Integration, Machinery, Terms } from '@/components/site/Sections';

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
 * WHAT CHANGED IN THE ORDER: Why us goes directly under the hero, the tool deck
 * follows it, then the AI implementation positioning, then everything that was
 * already here. Showcase is replaced by ToolDeck.
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
      <Machinery />
      <ProofOfOperation />
      <Terms />
      <Faq />
    </>
  );
}
