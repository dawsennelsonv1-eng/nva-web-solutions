'use server';

import { headers } from 'next/headers';
import { visualiseFinish, RENDER_DISCLOSURE } from '@/lib/ai/visualise';
import { MAX_MATERIAL_REFS } from '@/lib/ai/images';
import { finishMediaFor, indexByKey } from '@/lib/finishes/media';
import { renderDescription, swatchKeyFor } from '@/lib/verticals/epoxy/options';
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
  /**
   * What the visitor built in the picker, as group -> option key(s).
   *
   * THE ACTION TAKES THE CHOICES, NOT THE PICTURES. That distinction is the
   * security boundary of this whole feature — see resolveMaterials below.
   */
  selections?: Record<string, string | string[] | undefined>;
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
  | {
      ok: false;
      /** Written for a homeowner. The ONLY field he is ever shown. */
      message: string;
      /**
       * ======================================================================
       * THE OPERATOR'S COPY. NEVER RENDERED TO A VISITOR.
       * ======================================================================
       *
       * `message` is deliberately vague — "that is a fault on our side, not
       * with your photos" — because a homeowner can do nothing with a model
       * slug and should not be handed one mid-quote.
       *
       * But vague was ALL there was. The component's failure branch printed
       * that sentence and the component's `catch` printed "That did not come
       * back. Try it again.", which names nothing at all and was the only
       * thing on screen when the render broke. Two different failures, one
       * indistinguishable dead end.
       *
       * `code` separates a rate limit from an empty wallet from a retired
       * slug. `attempts` is every model tried with what each one said.
       * FinishVisualiser prints them only behind `?debug=1`, the same switch
       * ToolCard uses for the measurement.
       */
      failure?: {
        code: string;
        detail: string | null;
        attempts: string[];
      };
    };

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
    case 'invalid_request':
    case 'empty_result':
    case 'provider_error':
      // Named separately from the catch-all because these three are OURS to
      // fix, not the visitor's — a retired model slug, a malformed request, a
      // provider fault. Telling him to try a different photo would send him
      // off to solve a problem he did not cause and cannot solve. The detail
      // that identifies which one is in the ai_jobs ledger.
      return 'The preview could not be made — that is a fault on our side, not with your photos. Your quote is unaffected.';
    default:
      return 'The preview could not be made from that photo. Your quote is unaffected.';
  }
}

/**
 * ============================================================================
 * THE MATERIAL SAMPLES ARE RESOLVED HERE, AND NEVER SENT BY THE BROWSER
 * ============================================================================
 *
 * The obvious shape is for the picker — which already has every swatch URL on
 * screen — to send them along with the render request. DO NOT DO THIS.
 *
 * These URLs are handed to a paid image model as `input_references`, which
 * means anything accepted here is fetched by a third-party provider on our
 * account. An action that takes arbitrary URLs from an anonymous caller is a
 * server-side request forgery with somebody else's compute paying for it, and
 * a way to make our provider account fetch anything on the internet.
 *
 * So the browser sends CHOICES — 'metallic', 'copper_burl' — and this looks up
 * the corresponding rows in finish_media. The only URLs that can ever reach
 * the model are ones the operator uploaded through /admin/finishes. A visitor
 * inventing an option key gets no swatch, which is the correct failure.
 *
 * MAX_MATERIAL_REFS is enforced here too, not only in lib/ai/images.ts. Two
 * checks because they defend different things: this one bounds what a caller
 * can cause to be fetched, the other bounds what one request costs.
 */
async function resolveMaterials(
  selections: Record<string, string | string[] | undefined> | undefined
): Promise<string[]> {
  if (!selections) return [];
  try {
    const slots = await finishMediaFor('epoxy');
    const byKey = indexByKey(slots);
    const urls: string[] = [];

    /**
     * ORDER IS DELIBERATE: the system first, then whichever colour group
     * applies. Those two carry essentially all of the visual information, and
     * the cap means later entries may never be sent — so the ones that decide
     * what the floor looks like have to come first.
     */
    for (const group of [
      'system',
      'solid_colour',
      'flake_blend',
      'metallic_colour',
      'quartz_colour',
      'flake_coverage',
      'flake_size',
    ]) {
      const raw = selections[group];
      const keys = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
      for (const k of keys) {
        const hit = byKey.get('swatch|' + swatchKeyFor(group, k));
        // Only absolute https URLs. A /public path means nothing to a provider
        // fetching from the outside, and would be a reference that silently
        // resolves to nothing.
        if (hit && hit.src.startsWith('https://')) urls.push(hit.src);
        if (urls.length >= MAX_MATERIAL_REFS) return urls;
      }
    }
    return urls;
  } catch {
    // A render with no samples is worse than one with them, and far better
    // than none at all.
    return [];
  }
}

/**
 * ============================================================================
 * THE OUTER GUARD. AN ACTION THAT "NEVER THROWS" NOW ACTUALLY CANNOT.
 * ============================================================================
 *
 * Every comment in this file, and the whole design of VisualiseActionResult,
 * rests on the promise that this function returns a failure OBJECT rather than
 * raising. FinishVisualiser's `catch` exists only for the impossible case.
 *
 * That promise was never enforced, and the impossible case is what people have
 * been seeing. "The preview could not be sent. Check your connection." is that
 * catch firing, and it fires for anything at all that throws in here.
 *
 * WHAT IS ACTUALLY UNGUARDED, having read the path:
 *
 *   - `uploadFloorPhoto` in lib/ai/visualise.ts. A comment there states it
 *     never throws and returns null on failure. That may well be true; it is
 *     an ASSERTION IN A COMMENT about a file I have not read, and comments
 *     drift from the code they describe.
 *   - `checkBudget`, `recordAiJob` and `headers()`, none of which are wrapped
 *     at their call sites.
 *   - Anything Next itself raises while serialising the result.
 *
 * WHY A WRAPPER RATHER THAN HUNTING THE ONE BAD CALL. Two theories about this
 * failure have already been wrong. The request body was ruled out because
 * analyzePhotoAction sends three to five photographs through the same
 * transport and works. The execution ceiling was ruled out because
 * maxDuration is deployed on both routes and swatch generation — which
 * performs the same image call — succeeds.
 *
 * Guessing a third time is worse than making the code report the answer. A
 * throw from ANY of those now becomes a named failure that travels through the
 * normal result type, reaches the ledger-free `failure` field, and is visible
 * to the operator instead of being flattened into a sentence about the
 * network. Whatever the cause turns out to be, the next screenshot names it.
 *
 * THIS DOES NOT HIDE THE BUG. It stops the bug being anonymous. The underlying
 * throw still needs fixing once it has a name.
 */
export async function visualiseAction(
  args: VisualiseActionArgs
): Promise<VisualiseActionResult> {
  try {
    return await runVisualise(args);
  } catch (e) {
    const name = e instanceof Error ? e.name : 'Error';
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      /**
       * THE VISITOR IS TOLD THE TRUTH AND NOT BLAMED. The old copy sent him to
       * check a connection that was never the problem. This says the fault is
       * ours and that his quote survives, which is both true and the only
       * thing he can act on.
       */
      message:
        'The preview could not be produced. That is a fault on our side — your quote and your details are unaffected.',
      failure: {
        code: 'server_exception',
        detail: name + ': ' + message,
        attempts: [],
      },
    };
  }
}

async function runVisualise(args: VisualiseActionArgs): Promise<VisualiseActionResult> {
  // ---- 1. per-IP rate limit, before anything is decoded ---------------------
  const ip = clientIpFromHeaders(headers());
  if (ip) {
    const verdict = await checkIpRateLimit(ip);
    // GuardVerdict is a discriminated union on `ok`, and its failure arm
    // carries a message written for a homeowner. That message is used
    // verbatim rather than replaced — the guard knows whether this was a rate
    // limit or an unavailable limiter, and this action does not.
    if (!verdict.ok) {
      return {
        ok: false,
        message: verdict.message,
        failure: { code: 'ip_rate_limit', detail: verdict.message, attempts: [] },
      };
    }
  }

  // ---- 2. payload validation, before anything is spent ---------------------
  // Reuses the vision path's validator so there is exactly one definition of
  // an acceptable image in this codebase. A second, looser one here would be
  // the hole — the expensive endpoint accepting what the cheap one rejects.
  const valid = validateImagePayload(args.photoBase64, args.photoMediaType);
  if (!valid.ok) {
    return {
      ok: false,
      message: valid.message,
      failure: { code: 'invalid_payload', detail: valid.message, attempts: [] },
    };
  }

  // ---- 3. the render, which checks the daily ceiling itself ----------------
  const materialUrls = await resolveMaterials(args.selections);

  const result = await visualiseFinish({
    photoBase64: args.photoBase64,
    photoMediaType: args.photoMediaType,
    finishLabel: args.finishLabel,
    ...(args.selections ? { finishDescription: renderDescription(args.selections) } : {}),
    ...(materialUrls.length > 0 ? { materialUrls } : {}),
    colourLabel: args.colourLabel,
    colourHex: args.colourHex,
    surfaceLabel: args.surfaceLabel,
    sessionId: args.sessionId,
    prototypeId: args.prototypeId,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: messageFor(result.reason),
      failure: {
        code: result.reason,
        detail: result.detail ?? null,
        attempts: result.attempts ?? [],
      },
    };
  }

  return {
    ok: true,
    dataUrl: `data:${result.mediaType};base64,${result.base64}`,
    storagePath: result.storagePath,
    disclosure: RENDER_DISCLOSURE,
  };
}

export { RENDER_DISCLOSURE };
