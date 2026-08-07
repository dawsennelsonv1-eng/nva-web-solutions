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
