import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GradientField } from '@/components/site/GradientField';
import { MediaGallery } from '@/components/tools/MediaGallery';
import { ToolStory } from '@/components/tools/ToolStory';
import { SimilarTools } from '@/components/tools/SimilarTools';
import { ToolCtaRail } from '@/components/tools/ToolCtaRail';
import { Machinery } from '@/components/site/Sections';
import { toolPageFor, toolPageIds } from '@/lib/tools/catalogue';
import { mediaForTool } from '@/lib/tools/media';

/**
 * app/(public)/tools/[toolId]/page.tsx — ONE TEMPLATE, EVERY TOOL.
 *
 * ============================================================================
 * THE SHAPE, AND WHY IT IS FIXED
 * ============================================================================
 *
 *   1  Name, one-line promise, and the showcase
 *   2  Try me out / Get this on my site
 *   3  What it does for you — points, each with its picture
 *   4  Try me out / Get this on my site
 *   5  EXTRAS — sections only this tool has
 *   6  Others like this
 *   7  Try me out / Get this on my site
 *
 * Every tool gets that order. A visitor who has read one tool page can read the
 * next without relearning where anything is, which is the entire reason a
 * marketplace of small products works at all.
 *
 * ============================================================================
 * EXTRAS: THE EXCEPTION MECHANISM
 * ============================================================================
 *
 * Some tools need a section no other tool needs. The floor coating tool
 * publishes its full pricing arithmetic; a future tool might need a chart or a
 * calculator nothing else uses.
 *
 * Those are declared as data in lib/tools/catalogue.ts and rendered in a fixed
 * slot here. The rule being protected: an exception is a NAMED entry in a list,
 * never a conditional buried in a component. The moment this file starts
 * growing `if (toolId === 'epoxy')` inside the JSX, the template is dead and
 * every future tool page is a copy-paste job.
 *
 * ============================================================================
 * WHAT IS NOT ON THIS PAGE YET, AND WHY
 * ============================================================================
 *
 * REVIEWS. The brief asked for a reviews block. There are no customers yet, so
 * there is nothing true to put in it. Writing three plausible testimonials
 * would be the single most damaging thing that could be done to this site —
 * it is the one page arguing that every number on it is real and checkable, and
 * a contractor who suspects one fake review stops believing the pricing table
 * too. The section lands when there is a first real review to put in it.
 *
 * THE INTAKE QUESTIONNAIRE now exists: /start, backed by migration 0017 and
 * app/actions/implementation.ts. "Get this on my site" carries the tool id.
 *
 * MACHINERY ON THE HOMEPAGE. The published pricing model moves here. It is an
 * exception belonging to one tool, and the homepage is now the front of a
 * marketplace for nineteen.
 *
 * ============================================================================
 * ROUTING
 * ============================================================================
 *
 * A tool with no catalogue entry 404s rather than rendering empty sections.
 * Most of the nineteen in lib/queue/tools.ts have no page written, and a page
 * with nothing in it reads as a broken product — there is no version of that
 * which beats the page simply not existing yet.
 *
 * PUBLIC_IDS is duplicated from ToolDeck deliberately and the duplication is
 * flagged rather than abstracted: lib/queue is a data layer, and what is
 * PUBLIC is a presentation decision. VERIFY: keep these two in step. When a
 * third surface needs it, lift it to lib/site/ and import it in all three.
 */

const PUBLIC_IDS: readonly string[] = ['epoxy'];

/**
 * The questionnaire, carrying the tool it was reached from. /start reads ?tool=
 * for context only — an unknown or missing id changes the wording and nothing
 * else, so a mistyped link never costs a request.
 */
function intakeHref(toolId: string): string {
  return '/start?tool=' + encodeURIComponent(toolId);
}

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

  const slots = await mediaForTool(page.id);

  return (
    <>
      <GradientField />

      {/* 1 — name, promise, showcase */}
      <section className="n15-sec tp-top" aria-labelledby="tool-h">
        <div className="n15-in">
          <p className="n15-eyebrow">On your website</p>
          <h1 id="tool-h" className="n15-h2">
            {page.title}
          </h1>
          <p className="n15-lede">{page.tagline}</p>

          <MediaGallery slots={slots} label={page.title} />

          <p className="n15-body n15-measure">{page.intro}</p>

          {/* 2 — he has not tried anything yet, so trying leads. */}
          <ToolCtaRail
            tryHref={page.tryHref}
            intakeHref={intakeHref(page.id)}
            emphasis="try"
            note="It is the real tool, not a video of one. Nothing is recorded and you do not need an account."
          />
        </div>
      </section>

      {/* 3 */}
      <ToolStory points={page.storyPoints} slots={slots} />

      {/* 4 — he has seen what it does, so getting it leads. */}
      <section className="n15-sec tp-tight">
        <div className="n15-in">
          <ToolCtaRail
            tryHref={page.tryHref}
            intakeHref={intakeHref(page.id)}
            emphasis="buy"
            note="We build the branded version first and send you a link to it. You look at the working thing before you pay for anything."
          />
        </div>
      </section>

      {/* 5 — extras, in a fixed slot */}
      {page.extras.includes('pricing-model') && <Machinery />}

      {/* 6 */}
      <SimilarTools ids={page.similar} publicIds={PUBLIC_IDS} />

      {/* 7 */}
      <section className="n15-sec tp-tight">
        <div className="n15-in">
          <ToolCtaRail tryHref={page.tryHref} intakeHref={intakeHref(page.id)} emphasis="buy" />
        </div>
      </section>
    </>
  );
}
