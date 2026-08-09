import type { Metadata } from 'next';
import { GradientField } from '@/components/site/GradientField';
import { ToolDirectory } from '@/components/tools/ToolDirectory';
import { getQueueSections } from '@/lib/queue/data';

/**
 * app/(public)/demo/page.tsx — EVERY TOOL, FINISHED OR NOT. Phase 17C.
 *
 * ============================================================================
 * WHAT THIS PAGE USED TO BE, AND WHERE THAT WENT
 * ============================================================================
 *
 * It mounted <DemoExperience surface="demo" entryPoint="demo_page" /> — the
 * four-step widget, framed for a contractor walking the homeowner's path.
 *
 * THAT MOUNT IS NOT DELETED. It moved to the epoxy tool page as a declared
 * extra (lib/tools/catalogue.ts, 'live-widget'), which is where the brief puts
 * it: the page you reach from "Try me out" should BE the tool.
 *
 * VERIFY: DemoExperience was rendering nothing on this route — the heading and
 * the lede appeared and the widget did not. I have never seen that component,
 * so I could not diagnose it, and moving a mount does not fix it. If it is
 * still blank on the tool page, send me components/demo/DemoExperience.tsx and
 * it becomes a five-minute problem instead of a guess.
 *
 * ============================================================================
 * WHY A DIRECTORY BELONGS HERE
 * ============================================================================
 *
 * A visitor who reaches this page has stopped asking whether the thing is real
 * and started asking whether there is one for HIM. A single epoxy widget
 * answers that question wrongly for eighteen trades out of nineteen.
 *
 * Unfinished tools are shown, tagged, and still openable. See ToolDirectory for
 * why the tag is a label rather than a lock.
 *
 * force-dynamic because status is reconciled against the registry per request.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Every tool',
  description:
    'Every tool in the system — the ones running, the ones in testing, and the ones still on paper. Open any of them.',
  openGraph: {
    title: 'Every tool · Girder',
    description: 'The ones running, the ones in testing, and the ones still on paper.',
    type: 'website',
  },
};

export default async function DemoPage() {
  const sections = await getQueueSections();

  return (
    <>
      <GradientField />
      <section className="n15-sec" aria-labelledby="demo-h">
        <div className="n15-in">
          <p className="n15-eyebrow">For contractors</p>
          <h1 id="demo-h" className="n15-h2">
            Every tool, including the ones we are still building.
          </h1>
          <p className="n15-lede">
            Open any of them. The ones marked in testing work — they are just not
            finished, and you can see exactly how far along they are rather than
            being told to wait.
          </p>

          <ToolDirectory sections={sections} />
        </div>
      </section>
    </>
  );
}
