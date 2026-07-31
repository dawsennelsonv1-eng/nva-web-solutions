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
