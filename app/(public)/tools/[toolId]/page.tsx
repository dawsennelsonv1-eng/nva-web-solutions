import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GradientField } from '@/components/site/GradientField';
import { ToolCard } from '@/components/site/ToolCard';
import { ToolHowItWorks } from '@/components/tools/ToolHowItWorks';
import { ToolFeatures } from '@/components/tools/ToolFeatures';
import { ToolFaq } from '@/components/tools/ToolFaq';
import { ToolReviews } from '@/components/tools/ToolReviews';
import { SimilarTools } from '@/components/tools/SimilarTools';
import { ToolCtaRail } from '@/components/tools/ToolCtaRail';
import { Machinery } from '@/components/site/Sections';
import { DemoExperience } from '@/components/demo/DemoExperience';
import { MotionProvider } from '@/lib/motion';
import { toolPageFor, toolPageIds } from '@/lib/tools/catalogue';
import { mediaForTool } from '@/lib/tools/media';
import { PUBLIC_TOOLS, QUIET_REASON, pricerFor, tintFor } from '@/lib/tools/card-config';
import { isVisualiserConfigured } from '@/lib/site/render-config';
import { getQueueRow } from '@/lib/queue/data';

/**
 * app/(public)/tools/[toolId]/page.tsx — ONE TEMPLATE, EVERY TOOL. Phase 17D.
 *
 * ============================================================================
 * THE SHAPE, AND WHY IT IS FIXED
 * ============================================================================
 *
 *   1  Name, promise, and THE WORKING TOOL — the same card as the homepage
 *   2  How it works, step by step, with a frame per step
 *   3  What it changes about his week
 *   4  EXTRAS — the live widget, then the published arithmetic
 *   5  Questions about using it
 *   6  The tool again, with both actions
 *   7  Reviews
 *   8  Others like this
 *
 * Every tool gets that order. A visitor who has read one tool page can read the
 * next without relearning where anything is, which is the entire reason a
 * marketplace of small products works.
 *
 * ============================================================================
 * THE TOOL ITSELF IS AT THE TOP, NOT A GALLERY OF IT
 * ============================================================================
 *
 * "Try it out" on the homepage now lands here, so the first thing on the page
 * has to be the thing — the same live ToolCard, with the same upload, the same
 * estimate and the same real price. Its own recordings are inside it.
 *
 * Everything below the card is documentation. That split is what lets one page
 * serve both buttons: somebody who came to use it is already finished at the
 * top of the screen, and somebody who came to read scrolls.
 *
 * The card's configuration comes from lib/tools/card-config so this page and
 * the homepage deck cannot drift into pricing the same job differently.
 *
 * ============================================================================
 * EXTRAS: THE EXCEPTION MECHANISM
 * ============================================================================
 *
 * Sections one tool needs and others do not, declared as data in the catalogue
 * and rendered in a fixed slot. The rule being protected: an exception is a
 * NAMED entry in a list, never a conditional buried in JSX. The moment this
 * file grows `if (toolId === 'epoxy')` inside the markup, the template is dead.
 *
 * ============================================================================
 * A TOOL WITH NO PAGE 404s
 * ============================================================================
 *
 * Most of the nineteen have no catalogue entry. A page with empty sections
 * reads as a broken product, and there is no version of that which beats the
 * page not existing yet — /demo lists those and links them to their spec sheet.
 */

/** VERIFY: repoint if the questionnaire ever moves off /start. */
function intakeHref(toolId: string): string {
  return '/start?tool=' + encodeURIComponent(toolId);
}

/**
 * ============================================================================
 * maxDuration — WHY "THE PREVIEW COULD NOT BE SENT" HAPPENS.
 * ============================================================================
 *
 * A Server Action's endpoint IS THE PAGE IT WAS DEFINED ON. `visualiseAction`
 * is invoked from ToolCard, which this page renders, so the platform applies
 * THIS route segment's execution limit to it — not any setting on the action
 * itself, because there is nowhere on an action to put one.
 *
 * Unset, the limit is the platform default: 10 seconds on Hobby, 15 on Pro.
 *
 * Image generation does not finish in 15 seconds. lib/ai/images.ts allows each
 * candidate its own timeout measured in tens of seconds, and a render of a
 * garage floor with material references attached routinely takes 30 to 90. The
 * function was being killed mid-flight, long before any model replied.
 *
 * WHAT THAT LOOKED LIKE, and why it was so hard to attribute: the kill happens
 * at the platform, above the application. No exception is raised inside
 * `visualiseAction`, so its careful `{ ok: false, reason }` machinery never
 * runs and nothing reaches the ai_jobs ledger. The browser sees only a failed
 * request, which lands in FinishVisualiser's `catch` — "The preview could not
 * be sent. Check your connection." The connection was fine. The server was
 * fine. The provider was fine. The clock ran out.
 *
 * The measurement survived this because it is faster and because a chain that
 * fails fast still returns inside the window, which is precisely why the
 * render looked broken while the analysis looked healthy.
 *
 * 300 IS THE MAXIMUM ON VERCEL'S PRO PLAN and the right number here: it is not
 * a target, it is a ceiling that must sit ABOVE the application's own timeouts
 * so that the application is the thing that gives up first. That matters — a
 * timeout inside lib/ai/images.ts produces a named reason, a ledger row and a
 * retry button, while a platform kill produces the blank shrug above.
 *
 * VERIFY: on the Hobby plan the hard cap is 60, and a value above it is
 * rejected at build time rather than clamped. If a deploy fails naming this
 * line, the plan is Hobby — set it to 60, which still clears every render this
 * product performs.
 */
export const maxDuration = 300;

export function generateStaticParams() {
  return toolPageIds().map((toolId) => ({ toolId }));
}

export async function generateMetadata({
  params,
}: {
  params: { toolId: string };
}): Promise<Metadata> {
  const page = toolPageFor(params.toolId);
  if (!page) return { title: 'Not found' };
  return {
    title: page.title,
    description: page.tagline,
    openGraph: { title: page.title, description: page.tagline, type: 'website' },
  };
}

export default async function ToolPage({ params }: { params: { toolId: string } }) {
  const page = toolPageFor(params.toolId);
  if (!page) notFound();

  const [slots, row] = await Promise.all([mediaForTool(page.id), getQueueRow(page.id)]);
  if (!row) notFound();

  const pricer = pricerFor(page.id);
  const renderEnabled = isVisualiserConfigured();

  return (
    <>
      <GradientField />

      {/* 1 — the tool itself */}
      <section className="n15-sec tp-top" aria-labelledby="tool-h">
        <div className="n15-in">
          <p className="n15-eyebrow">On your website</p>
          <h1 id="tool-h" className="n15-h2">
            {page.title}
          </h1>
          <p className="n15-lede">{page.tagline}</p>

          <div className="tp-card">
            <ToolCard
              toolId={row.tool.id}
              trade={row.tool.trade}
              summary={row.tool.prices}
              unit={row.tool.unit}
              inService={row.status === 'IN SERVICE'}
              tint={tintFor(row.tool.id)}
              renderEnabled={renderEnabled}
              specHref={`/tools/${row.tool.id}`}
              quietReason={QUIET_REASON[row.tool.id]}
              pricer={pricer}
              intakeHref={intakeHref(page.id)}
              media={slots}
            />
          </div>

          <p className="n15-body n15-measure">{page.intro}</p>
        </div>
      </section>

      {/* 2, 3 */}
      <ToolHowItWorks steps={page.howItWorks} slots={slots} />
      <ToolFeatures features={page.features} />

      {/* 4 — extras. The live widget first: somebody who arrived on "Try it
             out" wants the thing, and reads the arithmetic after seeing a
             number come out of it. */}
      {page.extras.includes('live-widget') && (
        <section className="n15-sec tp-tight" aria-labelledby="live-h">
          <div className="n15-in">
            <p className="n15-eyebrow">For contractors</p>
            <h2 id="live-h" className="n15-h2">
              Walk the whole thing as your customer would.
            </h2>
            <p className="n15-lede">
              The full four-step version, running as a sample company, so you can
              see precisely what a homeowner does end to end on your own site.
            </p>
            <div className="tp-widget">
              {/*
                ============================================================
                MotionProvider IS LOAD-BEARING HERE. DO NOT REMOVE IT.
                ============================================================

                This is why the widget rendered blank on /demo, and it had been
                blank since Phase 13B rather than since I moved it.

                DemoExperience's root is <AnimatePresence><m.div
                initial={{opacity: 0}} animate={{opacity: 1}}>. `m` components
                come from framer-motion's LazyMotion build and only receive
                animation features inside a <LazyMotion> tree — which is what
                MotionProvider is.

                Outside one, they still render. They simply never animate. So
                `initial` applies, `animate` never runs, and the entire widget
                sits in the DOM at opacity 0 — present, focusable, invisible.
                That is worse than a crash: nothing appears in the console and
                the element is there in the inspector with the right markup.

                13B removed MotionProvider from app/(public)/layout.tsx on the
                stated reasoning that "the widget brings its own MotionProvider
                (see QuoteWidget), so routes that mount it are unaffected."
                That is true of QuoteWidget, which does mount one — but
                DemoExperience wraps QuoteWidget in its own m.div, one level
                ABOVE that provider. The layer that needed the context was the
                one nobody checked.

                THE LESSON FOR THE NEXT MOUNT: any route rendering
                DemoExperience directly must provide this. The safest permanent
                fix is moving the provider inside DemoExperience itself so it
                cannot be forgotten — worth doing, but it is that component's
                file and this phase does not own it.
              */}
              <MotionProvider>
                <DemoExperience surface="demo" entryPoint="demo_page" />
              </MotionProvider>
            </div>
          </div>
        </section>
      )}

      {page.extras.includes('pricing-model') && <Machinery />}

      {/* 5 */}
      <ToolFaq items={page.faq} />

      {/* 6 — the tool again, as a listing, with both actions. He has read the
             page by now; this is where the decision gets made. */}
      <section className="n15-sec tp-tight">
        <div className="n15-in">
          <div className="tp-relist">
            <p className="n15-eyebrow">{row.tool.unit}</p>
            <h2 className="n15-h3 tp-relist-h">{page.title}</h2>
            <p className="n15-body">{page.tagline}</p>
            <ToolCtaRail
              tryHref="#tool-h"
              intakeHref={intakeHref(page.id)}
              emphasis="buy"
              note="We build the branded version first and send you a link to it. You look at the working thing before you pay for anything."
            />
          </div>
        </div>
      </section>

      {/* 7, 8 */}
      <ToolReviews reviews={page.reviews} />
      <SimilarTools ids={page.similar} publicIds={PUBLIC_TOOLS} />
    </>
  );
}
