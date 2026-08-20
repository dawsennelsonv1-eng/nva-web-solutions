import { registerVertical, listVerticals } from '@/lib/verticals/registry';
import { epoxyVertical } from '@/lib/verticals/epoxy';
import { paintingVertical } from '@/lib/verticals/painting';
import { landscapingVertical } from '@/lib/verticals/landscaping';
import { cabinetsVertical } from '@/lib/verticals/cabinets';
import { fencingVertical } from '@/lib/verticals/fencing';

/**
 * THE ONE REGISTRATION POINT. This file belongs to the vertical surface, not
 * the core: adding vertical #3 (e.g. roofing) means creating
 * lib/verticals/roofing/ and adding ONE import + ONE register line here.
 * registry.ts and every engine file stay untouched — that is the Phase 11
 * success test, and NEW_VERTICAL.md will say exactly this.
 *
 * Idempotent on purpose: Next.js dev-mode HMR and route-level re-imports may
 * evaluate modules more than once per process.
 *
 * PAINTING IS LIVE as of Phase 11. It was deliberately held out of this file
 * for several pushes while the module could price but the widget could not yet
 * render its questions — an admin dropdown offering a vertical that cannot
 * quote is a broken promise on a contractor's screen, and the public hub reads
 * its live-verticals count straight off this registry. It is registered here
 * only now that PrototypeView -> LaunchGate -> PrototypeExperience threads the
 * declared step plan all the way to the widget.
 */

let registered = false;

export function ensureVerticalsRegistered(): void {
  if (registered) return;
  registered = true;
  registerVertical(epoxyVertical);
  registerVertical(paintingVertical);
  /**
   * LANDSCAPING, added in phase 71, and registered on the same terms painting
   * was: the module prices, and the widget renders its declared step plan
   * because that plan uses only controls painting already proved
   * (surface_select, photo, quantity, finish_select, colour_select,
   * single_select, multi_select). No new control kind was invented for it,
   * which is what makes this a one-line registration rather than a core
   * change.
   *
   * Its defaults row must exist before a prototype can quote — see
   * supabase/migrations/0025_landscaping_defaults.sql. A registered vertical
   * with no rules row resolves fine and then quotes nothing, which is the
   * failure NEW_VERTICAL.md warns about.
   */
  registerVertical(landscapingVertical);
  /**
   * CABINET REFINISHING, phase 76. Its own vertical rather than a painting
   * surface because it prices PIECES, not area — see the note at the head of
   * the module. Uses only controls painting and landscaping already proved, so
   * this is a registration and not a core change.
   *
   * Needs supabase/migrations/0026_cabinets_defaults.sql applied before it can
   * quote.
   */
  registerVertical(cabinetsVertical);
  /**
   * FENCING, phase 78. The first vertical measured in LINEAR FEET rather than
   * area or pieces — it reuses the quantity control with unit 'linear_ft', so
   * again no core change.
   *
   * Deliberately built on the photo-and-render path rather than waiting for
   * satellite perimeter measurement. The render is the reason anyone shares it;
   * satellite improves the measurement later and writes to the same field.
   *
   * Needs supabase/migrations/0027_fencing_defaults.sql.
   */
  registerVertical(fencingVertical);
}

export function getRegisteredVerticals() {
  ensureVerticalsRegistered();
  return listVerticals();
}

