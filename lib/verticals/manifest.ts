import { registerVertical, listVerticals } from '@/lib/verticals/registry';
import { epoxyVertical } from '@/lib/verticals/epoxy';
import { paintingVertical } from '@/lib/verticals/painting';

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
}

export function getRegisteredVerticals() {
  ensureVerticalsRegistered();
  return listVerticals();
}
