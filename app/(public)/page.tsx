import type { Metadata } from 'next';
import { Hero } from '@/components/marketing/Hero';
import { InfiniteMotion } from '@/components/marketing/InfiniteMotion';
import { ProofOfFlexibility } from '@/components/marketing/ProofOfFlexibility';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { WhoItsFor } from '@/components/marketing/WhoItsFor';
import { FranchiseComparison } from '@/components/marketing/FranchiseComparison';
import { CtaButton } from '@/components/marketing/CtaButton';
import { DemoExperience } from '@/components/demo/DemoExperience';

/**
 * app/(public)/page.tsx — THE PUBLIC HUB. "The live widget IS the hero."
 *
 * DemoExperience mounts directly inside Hero's children with
 * surface="public_hub" — real pricing engine, real photo analysis, real
 * lead capture, from the first paint. Nothing here is a screenshot standing
 * in for the product.
 *
 * Section order is deliberate: hero (the widget) -> infinite motion (proof
 * the theme engine reskins) -> proof of flexibility (proof the vertical
 * system generalises) -> how it works -> who it's for (honest qualification)
 * -> franchise comparison (the money argument) -> closing CTA. Everything
 * after the hero is there to convert someone who scrolled PAST an already-
 * working demo, which is a different, harder job than a typical landing
 * page's hero-then-pitch order.
 */

export const metadata: Metadata = {
  title: 'Girder — instant floor quotes that book jobs',
  description:
    'Not a website. The instant AI quoting system a $49,500 franchise sells you — for $500 and 0% of your revenue.',
  openGraph: {
    title: 'Girder — instant floor quotes that book jobs',
    description: 'Try the AI quoting engine live. Real pricing, no signup.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Girder — instant floor quotes that book jobs',
    description: 'Try the AI quoting engine live. Real pricing, no signup.',
  },
};

export default function PublicHubPage() {
  return (
    <>
      <Hero>
        <DemoExperience surface="public_hub" entryPoint="public_hub_hero" />
      </Hero>

      <InfiniteMotion />
      <ProofOfFlexibility />
      <HowItWorks />
      <WhoItsFor />
      <FranchiseComparison />

      <section className="border-t bg-sheet py-14 text-center">
        <div className="mx-auto max-w-2xl px-4">
          <h2 className="font-display font-condensed text-2xl font-bold sm:text-3xl">
            See exactly what your customer would see.
          </h2>
          <p className="mt-2 text-base text-rule">
            Full test drive, framed for a contractor evaluating this for his own site.
          </p>
          <div className="mt-6 flex justify-center">
            <CtaButton href="/demo">Test Drive the Software Now</CtaButton>
          </div>
        </div>
      </section>
    </>
  );
}
