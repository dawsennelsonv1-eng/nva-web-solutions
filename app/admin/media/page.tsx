import { ToolMediaEditor } from '@/components/admin/ToolMediaEditor';
import { mediaForToolInEditOrder } from '@/lib/tools/media';
import { toolPageIds } from '@/lib/tools/catalogue';

/**
 * app/admin/media/page.tsx — renders behind the existing /admin gate, the same
 * way app/admin/ai/page.tsx and app/admin/appearance/page.tsx do.
 *
 * force-dynamic so the editor always opens on what is actually saved. A cached
 * admin screen showing a stale list is how an operator saves over work he
 * cannot see.
 *
 * Only tools with a page in lib/tools/catalogue.ts are listed. A tool with no
 * page has nowhere for its recordings to appear, so offering to manage them
 * would be offering to fill a void.
 */

export const dynamic = 'force-dynamic';

/**
 * PHASE 38 ADDED IMAGE GENERATION TO THIS SCREEN, SO IT NEEDS THE CEILING.
 *
 * Every slot row can now call `generateToolMediaAction`, which runs an image
 * model for 30-90 seconds. Vercel's default function ceiling is well under
 * that, and the failure is a bad one to debug: the request is killed by the
 * platform, so the browser sees a network error rather than anything the
 * action returned, and the panel can only report that the request did not
 * complete. Nothing in the logs names a timeout.
 *
 * 300 matches every other screen that generates a picture — /admin/swatches,
 * /admin/combinations and /admin/tool-pictures all carry the same line for the
 * same reason. This screen was the only generator without it.
 *
 * It is a CEILING, not a budget: a page that does two database reads still
 * returns in milliseconds. It only matters when something legitimately runs
 * long, which is now the case here.
 */
export const maxDuration = 300;

export default async function MediaAdminPage() {
  const tools = await Promise.all(
    toolPageIds().map(async (id) => ({ id, slots: await mediaForToolInEditOrder(id) }))
  );

  return (
    <div className="px-4 py-8">
      <h1 className="font-display text-2xl font-extrabold uppercase">Tool media</h1>
      <p className="mt-2 max-w-[60ch] text-base">
        The recordings and pictures shown on each tool&apos;s page and on its card
        on the homepage. Three filled slots minimum — below that the gallery does
        not render at all. Ten maximum.
      </p>
      <p className="mt-2 max-w-[60ch] text-sm">
        Animations are shown first on the public page regardless of the order
        here, because motion is what stops a scroll. The order below controls the
        sequence within each kind.
      </p>

      <div className="mt-8 space-y-10">
        {tools.map((t) => (
          <ToolMediaEditor key={t.id} toolId={t.id} initial={t.slots} />
        ))}
      </div>
    </div>
  );
}

