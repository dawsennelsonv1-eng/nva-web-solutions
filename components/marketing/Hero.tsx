'use client';

import { CtaButton } from './CtaButton';
import type { ReactNode } from 'react';

/**
 * components/marketing/Hero.tsx — "the live widget IS the hero. Not a
 * screenshot, not a video, not a headline with a button under it."
 *
 * This component is deliberately thin: it supplies the headline, the single
 * glowing CTA, and the frame — the actual widget is passed as `children` and
 * rendered by the caller (app/(public)/page.tsx), because the widget needs
 * its own DemoExperience wrapper (payload-screen orchestration) that this
 * marketing component has no business knowing about. What matters for "no
 * scrolling or clicking first" is layout order: the widget sits directly
 * under the headline, above the fold, full width on a 360px screen — not
 * behind a "see it in action" click.
 *
 * THE "TRY IT" CTA IS A PLAIN ANCHOR JUMP, owned entirely inside this
 * component, rather than an onClick callback threaded in from the page:
 * app/(public)/page.tsx is a Server Component (it exports `metadata`, which
 * requires one), and a Server Component cannot pass a closure as a prop to a
 * Client Component — functions aren't serializable across that boundary.
 * An href="#try-it" needs no JavaScript at all and works identically before
 * and after hydration.
 */
export function Hero({ children }: { children: ReactNode }) {
  return (
    <section className="scroll-mt-4 px-4 pb-10 pt-8 sm:pb-16 sm:pt-14">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-2xl">
          <p className="font-data text-xs uppercase tracking-wide text-hazard">
            Dallas concrete &amp; epoxy contractors
          </p>
          <h1 className="mt-3 font-display font-condensed text-3xl font-bold leading-[1.05] sm:text-5xl">
            Turn the people already looking at your site into booked jobs.
          </h1>
          <p className="mt-4 max-w-lg text-base text-rule sm:text-lg">
            Not a website. The instant quoting system a $49,500 franchise sells you — for $500
            and 0% of your revenue.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
          <div id="try-it" className="order-2 scroll-mt-4 lg:order-1">
            {children}
          </div>
          <div className="order-1 flex flex-col items-start gap-3 lg:order-2 lg:pt-2">
            <CtaButton glow href="#try-it">
              Try the AI Quoting Engine Live
            </CtaButton>
            <p className="font-data text-xs text-rule">
              Real pricing engine. Nothing is sent unless you choose to.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
