import { ToolMediaStudio } from '@/components/admin/ToolMediaStudio';
/**
 *  from lib/tools/catalogue — the SAME function
 * app/(public)/tools/[toolId]/page.tsx uses in generateStaticParams.
 *
 * Taken from that file rather than guessed. My first attempt invented
 * `listVerticalIds` from `@/lib/tools/card-config`, which would have failed the
 * build the way a wrong import path did in phase 20. Using the page's own
 * source also means this list can never drift from the pages that exist.
 */
import { toolPageIds } from '@/lib/tools/catalogue';

/**
 * /admin/tool-pictures — generate the pictures that sit between the paragraphs
 * on a tool page.
 *
 * SEPARATE FROM /admin/media, which edits the slot list itself. This screen
 * makes a picture and puts it in the bucket; that screen decides which slot it
 * occupies, in what order, with what caption and for how long.
 *
 * They are split because saveToolMediaAction replaces a tool's ENTIRE slot set
 * in one call. A generator that wrote through it would have to resend every
 * existing slot untouched, and getting that wrong deletes recordings from a
 * live page without saying so. See app/actions/toolMediaGen.ts.
 */

export const dynamic = 'force-dynamic';

/** Image generation runs 30-90s; the platform default would kill it. */
export const maxDuration = 300;

export default function ToolPicturesPage() {
  return (
    <div>
      <h1 className="n15-h3">Tool page pictures</h1>
      <p style={{ marginTop: '0.6rem', maxWidth: '62ch' }}>
        Generate a photograph for one of the moments on a tool page, look at it,
        and put it in the bucket if it is any good. Then paste the address into a
        slot on the Tool media screen, which is where the order, the caption and
        the timing live.
      </p>
      <div style={{ marginTop: '1.5rem' }}>
        <ToolMediaStudio toolIds={toolPageIds()} />
      </div>
    </div>
  );
}
