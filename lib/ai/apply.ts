import 'server-only';
import type { AdminJobId } from './types';

/**
 * lib/ai/apply.ts — what happens when the admin presses Apply.
 *
 * READ THIS BEFORE YOU TRUST THE BUTTON.
 *
 * Applying a proposal means writing into tables owned by earlier phases: the
 * brand/copy store for site copy, the component config for a restyle, the
 * pricing parameters for a quote change. Phase 10 was scoped to two earlier
 * files — lib/quote/vision.ts and lib/quote/usage.ts — and touching a third
 * one blind is how you break a contractor's live site from a phone.
 *
 * So Apply does exactly what it can do honestly today: it validates the
 * payload again server-side, marks the ai_jobs row applied with who and when,
 * and returns a handler result saying what still needs wiring. The panel
 * repeats that to the admin instead of implying the site changed.
 *
 * TO FINISH THIS: paste the owning module for a job type and register a real
 * handler below. The seam is one function per job; nothing else changes.
 */

export interface ApplyOutcome {
  /** True only when a real write happened. Never true for a recorded no-op. */
  changed: boolean;
  message: string;
  action: string;
}

type ApplyHandler = (payload: unknown, jobId: string) => Promise<ApplyOutcome>;

const NOT_WIRED: Record<AdminJobId, { owner: string; next: string }> = {
  site_copy: {
    owner: 'the brand/copy store from Phase 6',
    next: 'Paste lib/brand/*.ts in the next phase to wire this write.',
  },
  component_restyle: {
    owner: 'the component combiner config from Phase 9',
    next: 'Paste the component config module in the next phase to wire this write.',
  },
  quote_params: {
    owner: 'the pricing parameter table from Phase 2',
    next: 'Paste lib/quote/pricing.ts in the next phase to wire this write.',
  },
};

const HANDLERS: Partial<Record<AdminJobId, ApplyHandler>> = {
  // Intentionally empty. Register real handlers here, one per job, only when
  // the module that owns the destination table is in scope for that phase.
};

export async function applyProposal(
  job: AdminJobId,
  payload: unknown,
  jobId: string
): Promise<ApplyOutcome> {
  const handler = HANDLERS[job];
  if (handler) return handler(payload, jobId);

  const info = NOT_WIRED[job];
  return {
    changed: false,
    message: `Approved and recorded. Nothing on the live site changed yet — this proposal is written to ${info.owner} by a handler that is not registered.`,
    action: info.next,
  };
}
