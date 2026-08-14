'use server';

import { requireAdmin } from '@/lib/auth/admin';
import { renderFinishImage } from '@/lib/ai/images';
import { recordAiJob } from '@/lib/ai/jobs';
import { checkBudget } from '@/lib/ai/budget';
import { EMPTY_USAGE } from '@/lib/ai/types';
import { NEUTRAL_BASE_HEX, solidPngDataUrl } from '@/lib/ai/swatch';

/**
 * The per-image estimate the budget gate reserves against, in cents.
 *
 * Deliberately the same 6 as lib/ai/visualise.ts: same endpoint, same
 * per-image charge. It is used ONLY to decide whether to start; the ACTUAL
 * cost OpenRouter reports is what reaches the ledger afterwards.
 */
const ESTIMATED_IMAGE_COST_CENTS = 6;

/**
 * app/actions/toolMediaGen.ts — generate an illustration for a tool page slot.
 *
 * ============================================================================
 * IT GENERATES AND RETURNS. IT NEITHER UPLOADS NOR SAVES.
 * ============================================================================
 *
 * `saveToolMediaAction` calls `replaceToolMedia`, which swaps a tool's ENTIRE
 * slot set for whatever it is given, and getting that wrong does not fail
 * loudly — it silently deletes the recordings already on a live tool page. So
 * this action never touches the slot list. It returns a picture and stops.
 *
 * Storing it is the caller's job, through the same signed-URL path the editor
 * has always used for a chosen file. Two callers do this today:
 * ToolMediaEditor, which patches one row of a local draft and leaves the
 * operator to press Save, and ToolMediaStudio, which hands back a bare address
 * for a slot this screen does not reach.
 *
 * The earlier version of this note asked for a generate button inside the
 * editor once that file had been read. Phase 38 built it; the note is replaced
 * rather than left as a fossil.
 *
 * ============================================================================
 * WHY A FLAT TILE IS THE REFERENCE
 * ============================================================================
 *
 * `renderFinishImage` requires a `referenceDataUrl` — it is an edit endpoint,
 * and that requirement is what stops the customer visualiser inventing a
 * garage instead of editing the homeowner's own.
 *
 * A tool-page illustration has no photograph to start from, so it gets the
 * same neutral concrete-grey substrate the colourless swatches use. The prompt
 * carries all the meaning; the tile exists to satisfy the endpoint and to keep
 * the result on a plausible surface rather than on white.
 */

export interface ToolMediaGenResult {
  ok: boolean;
  /**
   * Shown immediately so the operator can judge it before anything is stored.
   *
   * A `publicUrl` field used to be declared here too and was NEVER ONCE SET —
   * this action does not upload, so it has no address to give. Both callers
   * were already reading the address off `createToolMediaUploadAction`
   * instead, so nothing broke; the field simply advertised a value that could
   * not arrive, which is the kind of type that sends the next reader looking
   * for a bug in the wrong file. Removed in phase 38.
   */
  dataUrl?: string;
  prompt?: string;
  error?: string;
  attempts?: string[];
}

/**
 * The instruction, assembled from the operator's description.
 *
 * THE CONSTRAINTS ARE THE SAME ONES THE FLOOR RENDERER LEARNED, because they
 * were learned from real output rather than guessed: no invented light source,
 * no text, no watermark, and a photograph rather than an illustration. An
 * image model asked for "a garage being photographed" will otherwise return a
 * stock-illustration with a caption burned into it.
 */
function buildPrompt(subject: string): string {
  return [
    `A photograph for a home-improvement website: ${subject.trim()}`,
    'Real photography, not an illustration, not a 3D render, not a diagram.',
    'Natural domestic lighting. Do not add a bright highlight, a glare spot or a lens flare; if no light source is visible in the scene, none may appear.',
    'The supplied image is a neutral grey placeholder, not the subject — replace it entirely.',
    'No text, no captions, no labels, no logos, no watermarks, no user-interface elements, no arrows and no numbers anywhere in the picture.',
    'No recognisable faces. Hands and bodies are fine; a face that could identify somebody is not.',
    'Ordinary and believable rather than idealised — a real garage in a real house, not a showroom.',
  ].join(' ');
}

export async function generateToolMediaAction(args: {
  toolId: string;
  subject: string;
}): Promise<ToolMediaGenResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'Not signed in as an admin.' };

  const subject = args.subject.trim();
  if (subject.length < 8) {
    return { ok: false, error: 'Describe the picture in a few more words.' };
  }
  if (subject.length > 400) {
    return { ok: false, error: 'That description is too long — keep it to a sentence or two.' };
  }

  const tile = solidPngDataUrl(NEUTRAL_BASE_HEX);
  if (!tile) return { ok: false, error: 'Could not build the base image.' };

  const prompt = buildPrompt(subject);
/**
 * ============================================================================
 * THE BUDGET GATE AND THE LEDGER ROW. PHASE 41.
 * ============================================================================
 *
 * NEITHER OF THESE WAS HERE, AND THE OMISSION WAS INVISIBLE BY CONSTRUCTION.
 *
 * `renderFinishImage` renders and returns. It does not consult the ceiling and
 * it does not write to `ai_jobs` — it hands `costCents` back and leaves both to
 * the caller. lib/ai/visualise.ts, the customer render path, does exactly that:
 * `checkBudget` before, `recordAiJob` after, on success AND on failure. This
 * action called `renderFinishImage` directly and did neither.
 *
 * WHY THAT IS THE DANGEROUS DIRECTION OF WRONG. `ai_spend_today_cents` sums
 * `cost_cents` across `ai_jobs`. A call that writes no row is not counted, so
 * every image generated from here was free as far as the ceiling was
 * concerned, and the ceiling under-reported by exactly that amount. Compare
 * the bug lib/quote/vision.ts documents, where a double-written row made the
 * ceiling trip at HALF the real spend: that one fails loudly and refuses work
 * that should have been allowed. This one fails silently and allows work that
 * should have been refused. An operator watching the spend figure would have
 * seen a number that was simply not true, and the first symptom would have
 * been the provider bill.
 *
 * ORDER MATTERS: gate, then render, then record.
 *
 *   - The gate is BEFORE the call, so it is a stop rather than a report.
 *   - No ledger row is written when the gate refuses, because nothing was
 *     attempted and nothing was spent; a zero-cost failure row there reads as
 *     a provider problem when it was a deliberate refusal.
 *   - The row IS written when the render fails. OpenRouter's image billing is
 *     all-or-nothing so the cost is zero, but the row is what turns "renders
 *     have been failing since Tuesday" into a visible fact instead of a
 *     support conversation.
 *
 * `usage: EMPTY_USAGE` because tokens are meaningless for a per-image charge.
 * Zeroed rather than fabricated, so nothing downstream averages a token cost
 * that never existed. Same reasoning as visualise.ts, and the same constant.
 *
 * THE ESTIMATE IS THE SAME 6 CENTS visualise.ts uses, because it is the same
 * endpoint and the same per-image charge. If that number moves it must move in
 * both places; it is an estimate for the gate only, and the ACTUAL cost from
 * `usage.cost` is what reaches the ledger.
 */

  const budget = await checkBudget(ESTIMATED_IMAGE_COST_CENTS);
  if (!budget.allowed) {
    return { ok: false, prompt, error: budget.message };
  }

  const result = await renderFinishImage({ prompt, referenceDataUrl: tile });

  await recordAiJob({
    prototypeId: null,
    jobType: 'finish_render',
    provider: 'openrouter',
    model: result.ok ? result.model : 'chain_exhausted',
    usage: EMPTY_USAGE,
    costCents: result.ok ? result.costCents : 0,
    status: result.ok ? 'succeeded' : 'failed',
    error: result.ok ? null : result.reason,
    durationMs: result.durationMs,
    fellBackFrom: undefined,
    request: {
      kind: 'tool_media',
      modelsSkipped: result.fellBackFrom ?? [],
      attempts: result.attempts ?? [],
      toolId: args.toolId,
    },
  });

  if (!result.ok) {
    return {
      ok: false,
      prompt,
      error: result.reason + (result.detail ? ': ' + result.detail : ''),
      ...(result.attempts && result.attempts.length > 0 ? { attempts: result.attempts } : {}),
    };
  }

  return {
    ok: true,
    prompt,
    dataUrl: `data:${result.mediaType};base64,${result.base64}`,
  };
}

