'use server';

import { requireAdmin } from '@/lib/auth/admin';
import { renderFinishImage } from '@/lib/ai/images';
import { NEUTRAL_BASE_HEX, buildSwatchPrompt, solidPngDataUrl } from '@/lib/ai/swatch';
import { EPOXY_GROUPS } from '@/lib/verticals/epoxy/options';

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

  const result = await renderFinishImage({ prompt, referenceDataUrl: tile });

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
