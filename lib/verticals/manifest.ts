import { registerVertical, listVerticals } from '@/lib/verticals/registry';
import { epoxyVertical } from '@/lib/verticals/epoxy';

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
 * PAINTING IS TEMPORARILY OUT. The Phase 1 stub satisfied the v1 contract and
 * cannot satisfy v2, and an unbuilt module is worse than an absent one — an
 * admin dropdown listing a vertical that cannot price is a broken promise on a
 * contractor's screen. The real module lands in the next Phase 11 turn and
 * restores these two lines:
 *
 *   import { paintingVertical } from '@/lib/verticals/painting';
 *   registerVertical(paintingVertical);
 */

let registered = false;

export function ensureVerticalsRegistered(): void {
  if (registered) return;
  registered = true;
  registerVertical(epoxyVertical);
}

export function getRegisteredVerticals() {
  ensureVerticalsRegistered();
  return listVerticals();
}
