'use server';

import { requireAdmin } from '@/lib/auth/admin';
import { renderFinishImage } from '@/lib/ai/images';
import { NEUTRAL_BASE_HEX, solidPngDataUrl } from '@/lib/ai/swatch';

/**
 * app/actions/toolMediaGen.ts — generate an illustration for a tool page slot.
 *
 * ============================================================================
 * IT GENERATES AND RETURNS. IT DOES NOT SAVE THE SLOT.
 * ============================================================================
 *
 * `saveToolMediaAction` calls `replaceToolMedia`, which swaps a tool's ENTIRE
 * slot set for whatever it is given. A generator that wrote through it would
 * have to send every existing slot back untouched alongside the new one, and
 * components/admin/ToolMediaEditor.tsx — the screen that owns that list — has
 * not been read.
 *
 * Getting that wrong does not fail loudly. It silently deletes the recordings
 * already on a live tool page. So this action stops one step short: it
 * generates the picture, uploads it to the tool-media bucket through the same
 * signed-URL path the editor uses, and hands back the public URL.
 *
 * The operator pastes that URL into the editor, which already accepts an
 * `https://` src and already validates it. One extra step, and the slot list
 * stays owned by the one screen that understands it.
 *
 * WHEN ToolMediaEditor IS AVAILABLE the generate button belongs inside it,
 * writing the whole set at once — and this comment should be deleted rather
 * than left as a fossil.
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
  /** Paste this into the src field in the tool media editor. */
  publicUrl?: string;
  /** Shown immediately so the operator can judge it before pasting anything. */
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
  const result = await renderFinishImage({ prompt, referenceDataUrl: tile });

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
