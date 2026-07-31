import type { Metadata } from 'next';
import { DemoExperience } from '@/components/demo/DemoExperience';

/**
 * app/(public)/demo/page.tsx — the dedicated test-drive funnel.
 *
 * "/demo — the widget in 'live' mode, framed so the contractor understands
 * he is walking the homeowner's path." The framing copy above the widget
 * addresses the CONTRACTOR directly (second person, explicit about the
 * role-play); the widget itself then runs exactly as a homeowner would
 * experience it on his own future site — same server actions, same real AI
 * analysis, same lead write, same split-screen payoff as the public hub's
 * embedded version (components/demo/DemoExperience.tsx — one engine, two
 * routes).
 */

export const metadata: Metadata = {
  title: 'Test drive the AI quoting engine',
  description:
    'Walk through exactly what your future homeowner customers would experience — real pricing, real photo analysis, real lead capture.',
  openGraph: {
    title: 'Test drive the AI quoting engine',
    description: 'This is exactly what your customer sees on their phone. Try it yourself.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Test drive the AI quoting engine',
    description: 'This is exactly what your customer sees on their phone. Try it yourself.',
  },
};

export default function DemoPage() {
  return (
    <div className="mx-auto max-w-md px-4 pb-16 pt-8">
      <p className="font-data text-xs uppercase tracking-wide text-hazard">For contractors</p>
      <h1 className="mt-2 font-display font-condensed text-2xl font-bold sm:text-3xl">
        Walk it exactly as your customer would.
      </h1>
      <p className="mt-3 text-base text-rule">
        Everything below is the real thing — the actual pricing engine, the actual AI photo
        reading, running as &ldquo;{'Anchor Point Epoxy'}&rdquo; so you can see precisely what a
        homeowner does on your own future site. Add a photo if you want to see the AI work.
      </p>

      <div className="mt-6">
        <DemoExperience surface="demo" entryPoint="demo_page" />
      </div>
    </div>
  );
}
