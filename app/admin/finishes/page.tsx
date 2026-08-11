import { FinishMediaEditor, type FinishMediaTarget } from '@/components/admin/FinishMediaEditor';
import { finishMediaFor } from '@/lib/finishes/media';
import { EPOXY_GROUPS, swatchKeyFor } from '@/lib/verticals/epoxy/options';

/**
 * app/admin/finishes/page.tsx — behind the existing /admin gate, like
 * app/admin/ai/page.tsx and app/admin/media/page.tsx.
 *
 * force-dynamic so the editor always opens on what is actually saved. A cached
 * admin screen showing a stale list is how an operator saves over work he
 * cannot see.
 *
 * ============================================================================
 * SWATCHES ONLY, FOR NOW, AND THAT IS DELIBERATE
 * ============================================================================
 *
 * Combination photographs are keyed by a canonical string assembled from a
 * whole set of choices, and the catalogue permits hundreds of them. Listing
 * every possible combination here would be a page of several hundred empty
 * rows — unusable, and misleading about what is expected.
 *
 * The right way to add a combination photograph is from the picker itself,
 * where the operator has just assembled the exact mix and the key is already
 * computed. That is Phase 3. Until then, swatches are the ones that matter:
 * they are what a visitor taps, they are finite, and there are forty-odd.
 */

export const dynamic = 'force-dynamic';

export default async function FinishesAdminPage() {
  const existing = await finishMediaFor('epoxy');

  /**
   * Every option that can carry a swatch, in catalogue order.
   *
   * PREP IS EXCLUDED. Slab preparation changes nothing a camera can see — it
   * is grinding and patching under the coating — so offering a picture slot
   * for it would invite one that shows something other than what it claims.
   */
  const targets: FinishMediaTarget[] = [];
  for (const g of EPOXY_GROUPS) {
    if (g.key === 'prep') continue;
    for (const o of g.options) {
      targets.push({
        kind: 'swatch',
        mediaKey: swatchKeyFor(g.key, o.key),
        label: g.label + ' / ' + o.label,
        ...(o.hex ? { hex: o.hex } : {}),
      });
    }
  }

  const filled = existing.filter((e) => e.kind === 'swatch').length;

  return (
    <div className="px-4 py-8">
      <h1 className="font-display text-2xl font-extrabold uppercase">Finish pictures</h1>
      <p className="mt-2 max-w-[60ch] text-base">
        The swatches a homeowner taps when he customises his floor. {filled} of{' '}
        {targets.length} filled.
      </p>
      <p className="mt-2 max-w-[60ch] text-sm">
        Shoot each one as a close crop of the material filling the frame — no walls, no
        horizon. This is a sample, not a room. Roughly 400×300 is plenty; the ceiling is
        8 MB.
      </p>
      <p className="mt-2 max-w-[60ch] text-sm">
        An option with no picture falls back to a flat block of its colour. That is an
        honest placeholder and the picker will not pretend otherwise, but a real
        photograph of the finish converts far better than a rectangle.
      </p>

      <div className="mt-8">
        <FinishMediaEditor vertical="epoxy" targets={targets} existing={existing} />
      </div>
    </div>
  );
}
