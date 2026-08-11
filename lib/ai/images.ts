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

/**
 * THE CHAIN. You are not meant to manage this.
 *
 * OpenRouter's Auto Router (openrouter/auto) picks a model for you, but it is
 * a CHAT-COMPLETIONS feature — it ranks text models by task type. The Image
 * API takes an explicit image model and has no auto equivalent, so "just let
 * OpenRouter decide" is not available at this endpoint.
 *
 * This is the equivalent, built the same way lib/ai/config.ts already builds
 * chat routes: an ordered list, tried in order, falling through on failure.
 * The practical effect is what matters — nobody has to know which model ran,
 * a slug going stale degrades to the next candidate instead of breaking the
 * feature, and adding a better model later is one entry.
 *
 * ORDERED BY LATENCY FIRST, NOT QUALITY. This runs mid-funnel with a person
 * waiting, and OpenRouter's own documentation reports 94 seconds for one
 * gpt-image-2 render. The best picture nobody waits for is worth nothing, so
 * the fast editing models lead and the slower, higher-fidelity one is last —
 * reached only when the others are down.
 *
 * VERIFY: these slugs were correct when written and the image-model field
 * moves faster than anything else in this stack. Check what is live with:
 *   curl https://openrouter.ai/api/v1/images/models
 * Override without a redeploy by setting AI_IMAGE_MODELS to a comma-separated
 * list in Vercel. AI_IMAGE_MODEL (singular) still works and pins one model.
 */
export const DEFAULT_IMAGE_MODELS: readonly string[] = [
  'google/gemini-2.5-flash-image',
  'black-forest-labs/flux.2-flex',
  'openai/gpt-image-1',
];

/** @deprecated Kept so an existing AI_IMAGE_MODEL setting keeps working. */
export const DEFAULT_IMAGE_MODEL = DEFAULT_IMAGE_MODELS[0] as string;

/** Resolve the chain: explicit pin, then env list, then the default. */
export function imageModelChain(pinned?: string): string[] {
  if (pinned) return [pinned];
  const single = process.env.AI_IMAGE_MODEL?.trim();
  if (single) return [single];
  const list = process.env.AI_IMAGE_MODELS?.split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  if (list && list.length > 0) return list;
  return [...DEFAULT_IMAGE_MODELS];
}

/**
 * Which failures are worth trying the next model for.
 *
 * A stale or unrecognised slug (400) and a provider outage (5xx) are another
 * model's problem to solve, so those fall through. An empty wallet, a rate
 * limit and a timeout are NOT: a second model spends the same absent credit,
 * hits the same account limit, or adds another 45 seconds to a wait that has
 * already failed. Retrying those would turn one bad experience into three.
 */
function shouldFallThrough(reason: ImageFailureReason): boolean {
  return reason === 'invalid_request' || reason === 'provider_error' || reason === 'empty_result';
}

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
  /**
   * MATERIAL SAMPLES. Photographs of the finish the homeowner picked, passed
   * alongside his garage so the model can SEE the material instead of
   * inferring it from an adjective.
   *
   * This is the single largest quality change available to this feature.
   * "Copper burl metallic" is a phrase that means something specific to an
   * installer and almost nothing to an image model — it will produce some
   * brown swirl. Given an actual photograph of Copper Burl it matches pattern,
   * scale and depth, and the homeowner sees the floor he chose rather than the
   * model's idea of what those two words might mean.
   *
   * These are absolute https URLs from the public tool-media bucket, resolved
   * SERVER-SIDE from finish_media. They are never accepted from the browser —
   * see app/actions/visualise.ts for why that distinction matters.
   *
   * Capped at MAX_MATERIAL_REFS. Every extra reference is input cost on a call
   * the visitor is waiting through, and past three the model has already seen
   * the material from every angle it is going to.
   */
  materialUrls?: string[];
  /** Pins one model and disables the chain. For an admin test surface only. */
  model?: string;
}

/**
 * The reference photograph is ALWAYS first in the array and every prompt in
 * this codebase refers to it as "the first image". Reordering these would
 * silently make the model edit a swatch instead of a garage.
 */
export const MAX_MATERIAL_REFS = 3;

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
async function attemptRender(args: RenderImageArgs, model: string): Promise<ImageResult> {
  const started = Date.now();
  const apiKey = process.env.OPENROUTER_API_KEY;

  // Unconfigured is a valid state, not an error — the same posture
  // lib/notify/email.ts takes. A deployment without an image key simply has no
  // visualiser, and every other part of the widget works.
  if (!apiKey) {
    return { ok: false, reason: 'not_configured', durationMs: 0 };
  }

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
        input_references: [
          // FIRST, ALWAYS. This is the image being edited; the prompt refers
          // to it positionally.
          { type: 'image_url', image_url: { url: args.referenceDataUrl } },
          ...(args.materialUrls ?? [])
            .slice(0, MAX_MATERIAL_REFS)
            .map((url) => ({ type: 'image_url' as const, image_url: { url } })),
        ],
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
      // 400 detail is the one worth reading in full-ish: a stale model slug
      // and a malformed reference array both land here and look identical
      // from the outside. 400 characters is enough for OpenRouter's message
      // without turning a log line into a wall.
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        reason,
        detail: 'HTTP ' + res.status + ' from ' + model + ': ' + body.slice(0, 400),
        durationMs,
      };
    }

    const json = (await res.json()) as OpenRouterImageResponse;
    const first = json.data?.[0];
    if (!first?.b64_json) {
      return {
        ok: false,
        reason: 'empty_result',
        detail: (json.error?.message ?? 'no b64_json in response') + ' (model ' + model + ')',
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


/**
 * Render one image, trying each model in the chain until one answers.
 *
 * NEVER THROWS. The last failure's reason is returned, because that is the one
 * that describes the current state of the world — if every model was tried and
 * the last said the wallet is empty, "no credit" is the useful answer, not the
 * first model's 400.
 *
 * `fellBackFrom` lets the ledger record that a model was skipped, so a slug
 * quietly going stale shows up as a pattern in ai_jobs rather than as a
 * feature that silently got slower.
 */
export async function renderFinishImage(
  args: RenderImageArgs
): Promise<ImageResult & { fellBackFrom?: string[]; attempts?: string[] }> {
  const chain = imageModelChain(args.model);
  const skipped: string[] = [];
  /**
   * Every model tried and what it said, in order.
   *
   * ADDED BECAUSE A FAILED RENDER WAS UNDIAGNOSABLE. The chain would exhaust,
   * the visitor would see "that did not come back", and the only evidence left
   * was one reason code from the LAST model — which is useless when the actual
   * cause was the first model's slug being retired. This is written into the
   * ai_jobs ledger, so a stale slug is visible in the data instead of being
   * inferred from a support conversation.
   */
  const attempts: string[] = [];
  let last: ImageResult = { ok: false, reason: 'not_configured', durationMs: 0 };

  for (const model of chain) {
    const result = await attemptRender(args, model);
    if (result.ok) {
      return skipped.length > 0
        ? { ...result, fellBackFrom: skipped, attempts }
        : { ...result, attempts };
    }

    attempts.push(model + ' -> ' + result.reason + (result.detail ? ': ' + result.detail : ''));
    last = result;
    // Not configured means there is no API key at all — every candidate will
    // fail identically, so stop rather than looping over the same absence.
    if (result.reason === 'not_configured') break;
    if (!shouldFallThrough(result.reason)) break;
    skipped.push(model);
  }

  return skipped.length > 0
    ? { ...last, fellBackFrom: skipped, attempts }
    : { ...last, attempts };
}

