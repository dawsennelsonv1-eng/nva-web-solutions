import 'server-only';

/**
 * lib/ai/images.ts — IMAGE GENERATION. A separate client from the router, on
 * purpose.
 *
 * ============================================================================
 * WHY THIS IS NOT A PROVIDER IN lib/ai/providers/
 * ============================================================================
 *
 * Everything in providers/ speaks chat completions: messages in, tokens out,
 * usage counted per token, cost derived from a per-million rate table. The
 * whole router — fallback chains, repair, streaming, budget estimation — is
 * built on that shape.
 *
 * Image generation is a different endpoint with a different response and a
 * different billing model:
 *
 *   - It posts to /api/v1/images, not /chat/completions.
 *   - It returns base64 image bytes in `data[]`, not message content.
 *   - It bills PER IMAGE, not per token, so the per-million rate table in
 *     config.ts cannot price it. OpenRouter returns the actual USD cost in
 *     `usage.cost`, which this reads instead of estimating.
 *   - Billing is ALL OR NOTHING. A failed or cancelled generation is a 502 and
 *     is not billed at all — unlike a cancelled chat stream, which still bills
 *     for tokens already produced.
 *
 * Forcing that into OpenAiCompatibleProvider would mean a subclass that
 * overrides the endpoint, the request shape, the response parser and the cost
 * calculation — which is every part of it. So it lives here, small and honest,
 * and reuses the router's ai_jobs ledger rather than its transport.
 *
 * ============================================================================
 * THE MODEL IS AN ENV VAR, AND THAT IS THE IMPORTANT DECISION IN THIS FILE
 * ============================================================================
 *
 * VERIFY: the default below is a starting point, not a benchmarked choice. I
 * could not test render quality or latency from the build container, and the
 * image-model field moves faster than any other part of this stack — FLUX.1
 * Kontext was the obvious pick a few months ago and has since been superseded
 * by FLUX.2, with Gemini's Flash Image line and gpt-image-2 alongside it.
 *
 * Two properties matter here and they pull against each other:
 *
 *   FIDELITY TO THE ORIGINAL ROOM. The render must change the floor and leave
 *   the walls, the door, the shelving and the perspective exactly where they
 *   were. A model that redraws the room produces something prettier and
 *   useless — the homeowner is trying to see HIS garage.
 *
 *   LATENCY. This runs mid-funnel with a person waiting. OpenRouter's own
 *   documentation example for gpt-image-2 reports 94 seconds for one image.
 *   That is not a widget step; that is an abandonment.
 *
 * So the slug is read from AI_IMAGE_MODEL and can be changed in Vercel without
 * a redeploy — the same discipline config.ts already applies to every chat
 * slug. Generate three renders on three candidates with a real garage photo,
 * time them, and set the env var. Do not trust the default.
 *
 * Discover what is available and what each endpoint costs:
 *   curl https://openrouter.ai/api/v1/images/models
 */

export const IMAGE_ENDPOINT = 'https://openrouter.ai/api/v1/images';

/** VERIFY: unbenchmarked default. See the note above before trusting it. */
export const DEFAULT_IMAGE_MODEL = 'google/gemini-2.5-flash-image';

/**
 * A render is worth waiting for, but not indefinitely. 45s is past the point
 * where a homeowner has decided the site is broken, so the request is aborted
 * and the funnel continues without a picture — the quote never depended on it.
 */
const TIMEOUT_MS = 45_000;

export type ImageFailureReason =
  | 'not_configured'
  | 'timeout'
  | 'no_credit'
  | 'rate_limited'
  | 'invalid_request'
  | 'provider_error'
  | 'empty_result';

export type ImageResult =
  | {
      ok: true;
      base64: string;
      mediaType: string;
      /** Actual USD cost reported by OpenRouter, in cents. */
      costCents: number;
      model: string;
      durationMs: number;
    }
  | { ok: false; reason: ImageFailureReason; detail?: string; durationMs: number };

export interface RenderImageArgs {
  prompt: string;
  /**
   * The homeowner's own photo, as a data URL. Passing the real photo is what
   * makes this an EDIT rather than a generation — without it the model invents
   * a room, and an invented room is a lie with a price attached.
   */
  referenceDataUrl: string;
  /** Overrides AI_IMAGE_MODEL. Used by an admin test surface, not the funnel. */
  model?: string;
}

interface OpenRouterImageResponse {
  data?: { b64_json?: string; media_type?: string }[];
  usage?: { cost?: number };
  error?: { message?: string };
}

/**
 * Generate one edited image. NEVER THROWS — every failure is a reason code.
 *
 * That contract exists because of where this is called from: the middle of a
 * homeowner's quote. The picture is the nice-to-have and the price is the
 * product, so an image failure must degrade to "no picture" and let the funnel
 * continue. A throw here would take the quote down with it.
 */
export async function renderFinishImage(args: RenderImageArgs): Promise<ImageResult> {
  const started = Date.now();
  const apiKey = process.env.OPENROUTER_API_KEY;

  // Unconfigured is a valid state, not an error — the same posture
  // lib/notify/email.ts takes. A deployment without an image key simply has no
  // visualiser, and every other part of the widget works.
  if (!apiKey) {
    return { ok: false, reason: 'not_configured', durationMs: 0 };
  }

  const model = args.model ?? process.env.AI_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(IMAGE_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + apiKey,
        'content-type': 'application/json',
        // OpenRouter reads these to label traffic in the dashboard. Without
        // them every render in the ledger is anonymous, which defeats the
        // point of consolidating billing.
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nva.digital',
        'X-Title': 'Girder finish visualiser',
      },
      body: JSON.stringify({
        model,
        prompt: args.prompt,
        input_references: [{ type: 'image_url', image_url: { url: args.referenceDataUrl } }],
        n: 1,
        // WebP at moderate compression: this is stored and then emailed to a
        // contractor, so bytes matter more than the last few percent of
        // fidelity. PNG would roughly triple the row.
        output_format: 'webp',
        output_compression: 82,
        // Not streamed. Partial renders of a floor are worse than no render —
        // a half-drawn surface reads as a defect in the coating rather than as
        // a loading state, which is the opposite of reassuring.
        stream: false,
      }),
      signal: controller.signal,
    });

    const durationMs = Date.now() - started;

    if (!res.ok) {
      // 402 is a prepaid balance at zero. It is called out separately because
      // it is the one failure that is fixed by topping up rather than by
      // changing code, and it looks identical to a server error otherwise.
      const reason: ImageFailureReason =
        res.status === 402
          ? 'no_credit'
          : res.status === 429
            ? 'rate_limited'
            : res.status === 400
              ? 'invalid_request'
              : 'provider_error';
      const body = await res.text().catch(() => '');
      return { ok: false, reason, detail: body.slice(0, 200), durationMs };
    }

    const json = (await res.json()) as OpenRouterImageResponse;
    const first = json.data?.[0];
    if (!first?.b64_json) {
      return {
        ok: false,
        reason: 'empty_result',
        detail: json.error?.message,
        durationMs,
      };
    }

    // usage.cost is the ACTUAL charge in USD, not an estimate from a rate
    // table. Rounded up to the cent: under-reporting spend is the direction
    // that breaks a ceiling, so the rounding goes the safe way.
    const costCents = Math.ceil((json.usage?.cost ?? 0) * 100);

    return {
      ok: true,
      base64: first.b64_json,
      mediaType: first.media_type ?? 'image/webp',
      costCents,
      model,
      durationMs,
    };
  } catch (e) {
    const durationMs = Date.now() - started;
    const aborted = e instanceof Error && e.name === 'AbortError';
    return {
      ok: false,
      reason: aborted ? 'timeout' : 'provider_error',
      detail: e instanceof Error ? e.message : 'unknown_error',
      durationMs,
    };
  } finally {
    clearTimeout(timer);
  }
}
