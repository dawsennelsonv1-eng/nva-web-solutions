'use server';

import { requireAdmin } from '@/lib/auth/admin';
import { renderFinishImage } from '@/lib/ai/images';
import { recordAiJob } from '@/lib/ai/jobs';
import { checkBudget } from '@/lib/ai/budget';
import { EMPTY_USAGE } from '@/lib/ai/types';
import { NEUTRAL_BASE_HEX, buildSwatchPrompt, solidPngDataUrl } from '@/lib/ai/swatch';
import { EPOXY_GROUPS } from '@/lib/verticals/epoxy/options';

/**
 * The per-image estimate the budget gate reserves against, in cents.
 *
 * Deliberately the same 6 as lib/ai/visualise.ts: same endpoint, same
 * per-image charge. It is used ONLY to decide whether to start; the ACTUAL
 * cost OpenRouter reports is what reaches the ledger afterwards.
 */
const ESTIMATED_IMAGE_COST_CENTS = 6;

/**
 * app/actions/swatchGen.ts — generate one option's swatch, on demand, in admin.
 *
 * ============================================================================
 * IT RETURNS AN IMAGE. IT DOES NOT SAVE ONE.
 * ============================================================================
 *
 * This is the deliberate boundary of this phase and it is worth stating
 * plainly rather than discovering later.
 *
 * Saving would mean writing to finish_media and to the storage bucket, and the
 * two files that own those — lib/finishes/media.ts and
 * app/actions/finishMedia.ts — have not been read. Inventing a table shape and
 * a storage path would produce code that compiles perfectly and fails on
 * deploy, which is the worst possible outcome for somebody trying to record a
 * video today.
 *
 * So the action does the part that needs a model and hands the result back as
 * a data URL. The operator saves the picture and uploads it through the finish
 * media screen that already exists and already works. One extra step per
 * swatch, and nothing can silently corrupt.
 *
 * WHEN lib/finishes/media.ts IS AVAILABLE, the save belongs here, and this
 * comment should be deleted rather than left as a fossil.
 *
 * ============================================================================
 * ADMIN ONLY, CHECKED HERE, NOT ASSUMED FROM THE PAGE
 * ============================================================================
 *
 * lib/auth/admin.ts makes the argument in full: a Server Action's endpoint is
 * the page it was defined on, so in the normal browser flow the middleware
 * gate has already passed — but "nobody has built a form that calls this from
 * outside /admin yet" is not a security control, and this action spends money
 * on every invocation.
 */

export interface SwatchGenResult {
  ok: boolean;
  /** data:image/...;base64,... — ready for an <img src> and a download link. */
  dataUrl?: string;
  model?: string;
  costCents?: number;
  /** The instruction that produced it, so a bad result can be diagnosed. */
  prompt?: string;
  error?: string;
  /** Every model tried, in order, when the chain failed. */
  attempts?: string[];
}

export async function generateSwatchAction(
  groupKey: string,
  optionKey: string
): Promise<SwatchGenResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'Not signed in as an admin.' };

  /**
   * THE OPTION IS LOOKED UP SERVER-SIDE FROM THE CATALOGUE, never taken from
   * the browser. The caller sends two keys; the hex and the renderHint that
   * shape the prompt come from EPOXY_GROUPS. A client that could supply its
   * own prompt text would be a way to spend an admin's image budget on
   * arbitrary generations.
   */
  const group = EPOXY_GROUPS.find((g) => g.key === groupKey);
  const option = group?.options.find((o) => o.key === optionKey);
  if (!group || !option) {
    return { ok: false, error: `Unknown option: ${groupKey}/${optionKey}` };
  }

  /**
   * ==========================================================================
   * EVERY OPTION CAN BE GENERATED NOW. PHASE 13 WAS WRONG ABOUT THIS.
   * ==========================================================================
   *
   * `hex` is optional on FinishOptionDef, and phase 13 read that as "this
   * option has no appearance" and disabled the button. The topcoat group makes
   * the error obvious: satin, high gloss, matte and polyaspartic clear are
   * ENTIRELY appearance — sheen is the second most visible decision in the
   * whole tool — and all four were locked out for having no dominant colour.
   *
   * A colourless option gets the neutral concrete-grey substrate instead, and
   * the prompt tells the model plainly that the grey is a surface to finish
   * rather than a colour to preserve. See NEUTRAL_BASE_HEX in lib/ai/swatch.ts.
   *
   * This very likely matters beyond the swatches themselves. A finish the
   * catalogue could not illustrate is a finish the visualiser has no reference
   * for either — so a combination render was being asked to apply a topcoat
   * whose appearance had never been described to it in pictures.
   */
  const baseHex = option.hex ?? NEUTRAL_BASE_HEX;

  const tile = solidPngDataUrl(baseHex);
  if (!tile) {
    // Reachable only if a catalogue entry has a malformed hex — worth saying
    // out loud, because the picker would be painting a broken colour too.
    return { ok: false, error: `${option.label} has an unusable hex: ${option.hex}` };
  }

  const prompt = buildSwatchPrompt({
    groupKey: group.key,
    label: option.label,
    renderHint: option.renderHint,
    // Null, not the substitute grey: the prompt has to know the difference
    // between "match this colour" and "this grey is only a surface".
    hex: option.hex ?? null,
    blurb: option.blurb,
  });

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
    return { ok: false, error: budget.message, prompt };
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
      kind: 'swatch',
      modelsSkipped: result.fellBackFrom ?? [],
      attempts: result.attempts ?? [],
      group: group.key,
      option: option.key,
    },
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.reason + (result.detail ? ': ' + result.detail : ''),
      ...(result.attempts && result.attempts.length > 0 ? { attempts: result.attempts } : {}),
      prompt,
    };
  }

  return {
    ok: true,
    dataUrl: `data:${result.mediaType};base64,${result.base64}`,
    model: result.model,
    costCents: result.costCents,
    prompt,
  };
}

