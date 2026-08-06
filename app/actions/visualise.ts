'use server';

import { headers } from 'next/headers';
import { visualiseFinish, RENDER_DISCLOSURE } from '@/lib/ai/visualise';
import {
  validateImagePayload,
  checkIpRateLimit,
  clientIpFromHeaders,
} from '@/lib/quote/guards';

/**
 * app/actions/visualise.ts — the widget's door to the finish visualiser.
 *
 * ============================================================================
 * WHY THIS IS GUARDED HARDER THAN THE VISION CALL
 * ============================================================================
 *
 * A vision analysis reads a photo and costs a fraction of a cent. A render
 * DRAWS one, and costs ten to forty times as much. Everything that makes an
 * expensive endpoint attractive to abuse applies here and not to the rest of
 * the funnel:
 *
 *   - It is reachable by anon, because a homeowner is anonymous by definition.
 *   - It accepts an arbitrary image, so the payload is attacker-controlled.
 *   - Each call spends real money at a rate that empties a prepaid balance in
 *     minutes rather than days.
 *
 * So the same two guards the vision path uses run here first, and the render
 * is the LAST thing that happens rather than the first. lib/ai/visualise.ts
 * then checks the daily ceiling on top, which means three independent things
 * have to fail before a stranger can spend the balance: the IP limit, the
 * payload validator, and the spend ceiling.
 *
 * ============================================================================
 * THE PICTURE IS NEVER LOAD-BEARING
 * ============================================================================
 *
 * Every failure below returns a reason and nothing else. There is no throw and
 * no rejected promise, because this runs in the middle of a homeowner getting
 * a price, and the price is the product. A visualiser that is down, capped,
 * unconfigured or timing out must cost the picture and nothing else — the
 * quote continues, the lead is still captured, the contractor still gets the
 * job. That is the same rule the widget already applies to the AI analysis,
 * for the same reason.
 *
 * The image comes back as base64 rather than as a URL. The storage bucket is
 * private (0004_storage.sql) and minting a signed URL for something the
 * browser is about to display once would be a second round trip for no
 * benefit. The stored copy exists for the CONTRACTOR's record, not for this
 * render.
 */

export interface VisualiseActionArgs {
  photoBase64: string;
  photoMediaType: string;
  finishLabel: string;
  colourLabel?: string;
  colourHex?: string;
  surfaceLabel: string;
  sessionId: string;
  prototypeId: string | null;
}

export type VisualiseActionResult =
  | {
      ok: true;
      /** data: URL ready to put straight in an <img src>. */
      dataUrl: string;
      /** Storage path of the stored copy. Null when storage failed. */
      storagePath: string | null;
      /** The sentence that MUST be rendered beside the image. */
      disclosure: string;
    }
  | { ok: false; message: string };

/**
 * Reasons are mapped to sentences here rather than in the component, so every
 * surface that calls this says the same thing. They are written for a
 * homeowner, not an operator: he does not care that a prepaid balance hit
 * zero, only that the preview is unavailable and his quote is not.
 */
function messageFor(reason: string): string {
  switch (reason) {
    case 'not_configured':
      return 'The preview is not switched on for this site. Your quote is unaffected.';
    case 'over_budget':
    case 'no_credit':
      return 'Previews are unavailable right now. Your quote is unaffected.';
    case 'timeout':
      return 'The preview took too long, so we stopped waiting. Your quote is unaffected.';
    case 'rate_limited':
      return 'That is a lot of previews in a short time. Give it a minute.';
    default:
      return 'The preview could not be made from that photo. Your quote is unaffected.';
  }
}

export async function visualiseAction(
  args: VisualiseActionArgs
): Promise<VisualiseActionResult> {
  // ---- 1. per-IP rate limit, before anything is decoded ---------------------
  const ip = clientIpFromHeaders(headers());
  if (ip) {
    const verdict = await checkIpRateLimit(ip);
    // GuardVerdict is a discriminated union on `ok`, and its failure arm
    // carries a message written for a homeowner. That message is used
    // verbatim rather than replaced — the guard knows whether this was a rate
    // limit or an unavailable limiter, and this action does not.
    if (!verdict.ok) return { ok: false, message: verdict.message };
  }

  // ---- 2. payload validation, before anything is spent ---------------------
  // Reuses the vision path's validator so there is exactly one definition of
  // an acceptable image in this codebase. A second, looser one here would be
  // the hole — the expensive endpoint accepting what the cheap one rejects.
  const valid = validateImagePayload(args.photoBase64, args.photoMediaType);
  if (!valid.ok) return { ok: false, message: valid.message };

  // ---- 3. the render, which checks the daily ceiling itself ----------------
  const result = await visualiseFinish({
    photoBase64: args.photoBase64,
    photoMediaType: args.photoMediaType,
    finishLabel: args.finishLabel,
    colourLabel: args.colourLabel,
    colourHex: args.colourHex,
    surfaceLabel: args.surfaceLabel,
    sessionId: args.sessionId,
    prototypeId: args.prototypeId,
  });

  if (!result.ok) return { ok: false, message: messageFor(result.reason) };

  return {
    ok: true,
    dataUrl: `data:${result.mediaType};base64,${result.base64}`,
    storagePath: result.storagePath,
    disclosure: RENDER_DISCLOSURE,
  };
}

export { RENDER_DISCLOSURE };
