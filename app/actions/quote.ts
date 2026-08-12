'use server';

import { headers } from 'next/headers';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { can } from '@/lib/entitlements/check';
import { PricingError, type PricingInput } from '@/lib/quote/pricing';
import { priceQuote } from '@/lib/quote/price-quote';
import type { QuoteComputationOf } from '@/lib/quote/kit';
import { analyzeFloorPhoto, analysisToPricingHints, type VisionField } from '@/lib/quote/vision';
import {
  consumeAnalysis,
  countSessionAnalyses,
  reserveSessionAnalysis,
  sessionAnalysisLimit,
} from '@/lib/quote/usage';
import {
  checkDailySpendCeiling,
  checkIpRateLimit,
  clientIpFromHeaders,
  validateImagePayload,
} from '@/lib/quote/guards';
import { trackServer } from '@/lib/analytics.server';
import { generateQuotePublicId } from '@/lib/slug';
import { uploadFloorPhoto } from '@/lib/storage/photos';
import type { DbDegradedReason, Surface, WidgetMode } from '@/types';

/**
 * app/actions/quote.ts — the server orchestration for the quoting engine.
 *
 * ORDER OF OPERATIONS on the paid path, and why it cannot be reordered:
 *   1. entitlement       — decides degraded vs live BEFORE anything costs money
 *   2. session reserve    — bounds attempts per visitor
 *   3. payload validation — nothing oversized leaves this process
 *   4. IP rate limit      — bounds attempts per connection
 *   5. daily ceiling      — the guard that cannot be routed around
 *   6. THE CALL
 *   7. meter, and only now — a failed call never consumes the contractor's quota
 *
 * Mode is an explicit argument on every action. It is never derived from the
 * route, the referer, or the presence of a prototype id (R-123).
 *
 * PHASE 11: neither action knows a trade any more. The photo path hands the
 * vertical id to lib/quote/vision.ts, which asks the module for its prompt and
 * schema; the pricing path calls priceQuote(), which asks the module to price
 * its own answers. Adding roofing changes nothing in this file.
 *
 * THE STEP ORDER ABOVE IS UNCHANGED, including the one addition: the
 * quote_config read added at step 6a is a READ, it happens after every guard
 * has already passed, and it cannot alter whether the call is made — only what
 * is done with the answer.
 */

export interface AnalyzeRequest {
  mode: WidgetMode;
  surface: Surface;
  prototypeId: string | null;
  sessionId: string;
  vertical: string;
  /**
   * ONE photograph. Retained so every Phase 3-26 caller compiles and behaves
   * identically; `images` supersedes it.
   */
  imageBase64?: string;
  mediaType?: 'image/jpeg' | 'image/webp' | 'image/png';
  /**
   * SEVERAL views of the same space, analysed together in a single call.
   *
   * The guard sequence below runs UNCHANGED and in the same order. What
   * changes is that steps 3 and 7a now loop: every image is validated before
   * any of them leaves this process, and every image is uploaded after the
   * analysis succeeds. Steps 1, 2, 4, 5 and 6 are per-REQUEST and stay that
   * way — this is one analysis of one space, so it reserves one session slot,
   * consumes one unit of the contractor's cap and makes one provider call, no
   * matter how many frames it carries.
   *
   * That is the honest accounting. Five photographs in one call cost more
   * input tokens than one, but nothing like five analyses, and metering it as
   * five would charge a contractor's cap four times over for a single answer.
   */
  images?: { base64: string; mediaType: 'image/jpeg' | 'image/webp' | 'image/png' }[];
  /**
   * PHASE 11: what the visitor has already answered, so the module can sharpen
   * its prompt. Optional — a caller that omits it gets the module's base
   * prompt, which is exactly the Phase 3 behaviour.
   */
  selections?: Record<string, unknown>;
  surfaceTypeId?: string;
}

export interface AnalyzeResponse {
  status: 'ok' | 'manual_entry' | 'degraded';
  hints?: {
    surfaceTypeId?: string;
    estimatedSqft?: number;
    conditionModifierIds: string[];
    handToUser: VisionField[];
    /**
     * THE MEASURED BAND. This is what the visitor is now shown — "your floor
     * is between 440 and 520 sq ft" — rather than a bare midpoint presented as
     * a fact. A band is both more honest AND more convincing: it reads as
     * something that was measured rather than something that was guessed.
     */
    areaBand?: {
      lowSqft: number;
      highSqft: number;
      reference: string | null;
      /** Prefills the correction form. See AreaBand in lib/quote/vision.ts. */
      lengthFt: number | null;
      widthFt: number | null;
    } | null;
    /** PHASE 11: the module's own inputs, keyed by its declared writesTo keys. */
    answers?: Record<string, unknown>;
  };
  degradedReason?: DbDegradedReason;
  /** Plain-language copy for the visitor. Never mentions billing (R-146). */
  message?: string;
  /**
   * ==========================================================================
   * WHY THIS FIELD EXISTS, AND WHY IT IS OPTIONAL RATHER THAN A NEW STATUS
   * ==========================================================================
   *
   * `status: 'manual_entry'` covers two situations that are not remotely the
   * same thing:
   *
   *   A. The visitor is out of analyses for this session, or sent a photo
   *      that is too large. Nothing is broken. Ask him for the size.
   *   B. Every model in the chain failed. The product's headline feature is
   *      down and nobody has been told.
   *
   * Callers could not tell them apart, so ToolCard treated B as A — it moved
   * to its 'ready' state with the DEFAULT square footage still in the slider
   * and no error anywhere on screen. A visitor then priced a 200 sq ft
   * courtyard as a 480 sq ft garage, and the number he was shown was more
   * than double what the job costs.
   *
   * `failed` is the discriminator. `code`, `detail` and `attempts` are for the
   * OPERATOR and must never be rendered to a homeowner — they name models,
   * providers and HTTP statuses.
   *
   * ADDED AS AN OPTIONAL FIELD rather than widening the `status` union on
   * purpose. QuoteWidget, the quote machine, DemoExperience and the
   * calibration surface all switch on `status`; a new member would have to be
   * handled in each of them in the same commit or the build breaks. Every one
   * of those callers compiles and behaves identically against this.
   */
  failure?: {
    failed: boolean;
    code: string;
    detail: string | null;
    attempts: string[];
  };
  remainingSession?: number;
  /**
   * Phase 6: the Storage path the photo was uploaded to, if the upload
   * succeeded. Threaded through the widget machine and attached to the
   * quote row at persist time — see lib/storage/photos.ts.
   *
   * With several photographs this is the FIRST successfully uploaded one, so
   * that every existing consumer — the quote row, the leads inbox drawer —
   * keeps working against a single path exactly as it did. The full set is
   * `photoPaths`.
   */
  photoPath?: string | null;
  /** Every photo that uploaded, in the order they were sent. */
  photoPaths?: string[];
  /** How many frames the analysis actually looked at. */
  photoCount?: number;
}

/** Maps an entitlement decision onto the persisted degraded_reason enum. */
function toDegradedReason(reason: string): DbDegradedReason {
  if (reason === 'cap_reached') return 'cap_reached';
  if (reason === 'subscription_suspended') return 'subscription_suspended';
  return 'ai_unavailable';
}

/**
 * The contractor's own rules, or null when there is no config row to read —
 * which is the /demo case, where pricing comes from a constant. Never throws:
 * a failed read costs the hint filter, not the analysis.
 */
async function loadRules(
  prototypeId: string | null,
  vertical: string
): Promise<unknown | null> {
  if (!prototypeId) return null;
  try {
    const db = getSupabaseAdminClient();
    const { data } = await db
      .from('quote_configs')
      .select('rules')
      .eq('prototype_id', prototypeId)
      .eq('vertical', vertical)
      .maybeSingle();
    return data?.rules ?? null;
  } catch {
    return null;
  }
}

export async function analyzePhotoAction(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  const evtCtx = {
    surface: req.surface,
    mode: req.mode,
    sessionId: req.sessionId,
    prototypeId: req.prototypeId,
  };

  // 1 — entitlement. /demo has no prototype and is never metered against one.
  if (req.prototypeId) {
    const decision = await can(
      { prototypeId: req.prototypeId, tier: null, subscriptionStatus: null },
      'quote.ai_analysis',
      { sessionId: req.sessionId, mode: req.mode }
    );

    if (!decision.allowed) {
      if (decision.reason === 'session_limit') {
        // NOT degraded: the deterministic quote still completes.
        trackServer('session_limit_reached', {}, evtCtx);
        return {
          status: 'manual_entry',
          remainingSession: 0,
          message: "You've used your photo analyses for this visit. Enter the details yourself and we'll price it instantly.",
        };
      }
      const degradedReason = toDegradedReason(decision.reason);
      trackServer('degraded_mode_entered', { reason: degradedReason }, evtCtx);
      return {
        status: 'degraded',
        degradedReason,
        message: 'Instant pricing is unavailable right now. Leave your details and you will get a quote shortly.',
      };
    }
  }

  /**
   * ==========================================================================
   * 2 — SESSION RESERVE. IT USED TO HAPPEN HERE. IT NOW HAPPENS ON SUCCESS.
   * ==========================================================================
   *
   * `reserveSessionAnalysis` INCREMENTS a counter. Called at this point it
   * charged the visitor one of his three analyses for merely ATTEMPTING one —
   * before the payload was validated, before the rate limiter, and crucially
   * before the vision chain ran.
   *
   * So during the weeks the chain was broken by a retired model slug, every
   * homeowner who tried got charged three times for three failures and was
   * then locked out of the headline feature for the rest of his visit, with
   * "You've used your photo analyses for this visit" as the explanation. He
   * had used nothing. He had received nothing. The product took his quota and
   * blamed him for it.
   *
   * That is the single most user-hostile behaviour found in this codebase, and
   * it was invisible because it only bites when something else is already
   * broken — which is exactly when a person is least able to tell the
   * difference between "you ran out" and "we are broken".
   *
   * WHY MOVING IT IS SAFE. Reserve-before-spend is the right instinct, and it
   * is not the thing protecting the bank account here. Three guards stand
   * between this line and any money:
   *
   *   - the per-IP rate limit (12 analyses per window by default, DB-backed,
   *     0005_rate_limits.sql) — this is the real spend guard, and guards.ts
   *     says so in its own header
   *   - the daily spend ceiling, checked at step 5
   *   - the contractor's own entitlement, checked at step 1
   *
   * The session counter was never the wall. It is a courtesy limit on how many
   * times ONE visitor may use a feature, and counting attempts rather than
   * deliveries made it a punishment instead.
   *
   * The worst case this opens is a single session consuming up to the per-IP
   * limit in failed calls. A failed call bills nothing — OpenRouter charges
   * all-or-nothing per image and a failed completion returns no usage — so the
   * exposure is rate-limiter-bounded requests that cost zero.
   *
   * A CHECK STILL RUNS FIRST, immediately below. It reads the counter without
   * incrementing it, so somebody who genuinely has had three analyses is still
   * told so before a model is called.
   */
  const sessionLimit = sessionAnalysisLimit();
  if (sessionLimit > 0) {
    const alreadyUsed = await countSessionAnalyses(req.sessionId);
    if (alreadyUsed >= sessionLimit) {
      trackServer('session_limit_reached', {}, evtCtx);
      return {
        status: 'manual_entry',
        remainingSession: 0,
        message:
          "You've used your photo analyses for this visit. Reload the page for a fresh set, or enter the size yourself and we'll price it instantly.",
      };
    }
  }

  // 3 — payload. Normalised to a list first so there is exactly one code path
  //     below; a single-photo caller is a list of one.
  const images =
    req.images && req.images.length > 0
      ? req.images
      : req.imageBase64 && req.mediaType
        ? [{ base64: req.imageBase64, mediaType: req.mediaType }]
        : [];

  if (images.length === 0) {
    return {
      status: 'manual_entry',
      message: 'No photo came through. Add one, or enter the size yourself.',
    };
  }

  // EVERY image is validated before ANY of them leaves this process. Checking
  // them as they are sent would mean an oversized fourth frame is discovered
  // after three have already gone to the provider — billed, and for an answer
  // that is then discarded.
  for (const img of images) {
    const payload = validateImagePayload(img.base64, img.mediaType);
    if (!payload.ok) {
      trackServer('photo_rejected', { reason: payload.code === 'image_too_large' ? 'dimensions' : 'unsupported_type' }, evtCtx);
      return { status: 'manual_entry', message: payload.message };
    }
  }

  // 4 — per-connection
  const ip = clientIpFromHeaders(headers());
  const rate = await checkIpRateLimit(ip);
  if (!rate.ok) {
    trackServer('rate_limit_triggered', { endpoint: 'analyzePhotoAction' }, evtCtx);
    return { status: 'manual_entry', message: rate.message };
  }

  // 5 — the global spend stop
  const ceiling = await checkDailySpendCeiling();
  if (!ceiling.ok) {
    if (ceiling.code === 'daily_ceiling') trackServer('ai_daily_ceiling_hit', { spend_cents: 0 }, evtCtx);
    trackServer('degraded_mode_entered', { reason: 'ai_unavailable' }, evtCtx);
    return { status: 'degraded', degradedReason: 'ai_unavailable', message: ceiling.message };
  }

  // 6 — the call
  trackServer('analysis_started', {}, evtCtx);
  const started = Date.now();
  const result = await analyzeFloorPhoto({
    images,
    vertical: req.vertical,
    prototypeId: req.prototypeId,
    context: {
      surfaceTypeId: req.surfaceTypeId,
      // photoCount rides in on selections so the module can switch to its
      // multi-image prompt. A vertical that does not read the key is
      // unaffected, which is why this is not a new field on VisionContext.
      selections: { ...(req.selections ?? {}), photoCount: images.length },
    },
  });

  if (result.status !== 'ok') {
    trackServer(
      'analysis_failed',
      {
        reason:
          result.reason === 'timeout' ? 'timeout'
          : result.reason === 'invalid_json' ? 'invalid_json'
          : result.reason === 'schema' ? 'schema'
          : result.reason === 'rate_limited' ? 'rate_limited'
          : 'provider_error',
      },
      evtCtx
    );
    // Our failure, not his cap: quota untouched, and the visitor is handed a
    // path that still ends in a price.
    //
    // THE COPY CHANGED. It used to say "We couldn't read that photo", which
    // blames the visitor's photographs for a provider outage and sends him off
    // to reshoot a garage that was photographed perfectly well. When the fault
    // is ours the sentence says so — the same rule app/actions/visualise.ts
    // already applies to a failed render.
    return {
      status: 'manual_entry',
      message:
        result.reason === 'rate_limited'
          ? 'The measurement is busy right now. Give it a minute, or enter the size yourself.'
          : result.reason === 'timeout'
            ? 'The measurement took too long, so we stopped waiting. Try again, or enter the size yourself.'
            : 'The measurement did not run — that is a fault on our side, not with your photos. Enter the size yourself and everything else works as normal.',
      failure: {
        failed: true,
        code: result.reason,
        detail: result.detail ?? null,
        attempts: result.attempts ?? [],
      },
    };
  }

  // 7 — meter, only now
  await consumeAnalysis({
    prototypeId: req.prototypeId,
    mode: req.mode,
    sessionId: req.sessionId,
    surface: req.surface,
  });

  trackServer(
    'analysis_completed',
    { duration_ms: Date.now() - started, confidence_low_fields: result.handToUser },
    evtCtx
  );
  for (const field of result.handToUser) {
    trackServer('analysis_field_handed_to_user', { field }, evtCtx);
  }

  // Phase 6: persist the photo now, while the decoded bytes are already in
  // hand. Never blocks or fails the response — uploadFloorPhoto degrades to
  // null on any storage problem, and a quote with no photo is a state the
  // leads inbox already renders cleanly.
  //
  // Sequential rather than Promise.all: these run after the visitor already
  // has his answer, nothing downstream waits on them, and five concurrent
  // uploads on a phone's connection is how you turn a working upload into a
  // timeout. Each one degrades to null independently.
  const photoPaths: string[] = [];
  for (const img of images) {
    const path = await uploadFloorPhoto({
      prototypeId: req.prototypeId,
      sessionId: req.sessionId,
      base64: img.base64,
      mediaType: img.mediaType,
    });
    if (path) photoPaths.push(path);
  }
  const photoPath = photoPaths[0] ?? null;

  // 6a — PHASE 11. Read the contractor's rules so inferred modifier ids can be
  // filtered against what he actually charges for. A read, after every guard,
  // that cannot change whether the call happened. Before this, an AI-suggested
  // id absent from his config reached the pricing engine and threw
  // unknown_modifier — a paid analysis that produced no price at all.
  const rules = await loadRules(req.prototypeId, req.vertical);
  const hints = analysisToPricingHints(result, rules);

  /**
   * THE ANALYSIS IS CHARGED HERE, WHERE IT WAS ACTUALLY DELIVERED.
   *
   * Every failure path above returned before reaching this line, so a visitor
   * is only ever charged for a measurement he received. See the long note at
   * step 2 for why this moved.
   *
   * `allowed` is deliberately ignored. The counter has already done its job at
   * step 2b, which read it BEFORE any money was spent; refusing to hand over a
   * result that has already been paid for would be the worst of both — the
   * spend without the answer. This call is bookkeeping.
   */
  const charged = await reserveSessionAnalysis(req.sessionId, sessionLimit);

  return {
    status: 'ok',
    hints: { ...hints, handToUser: result.handToUser, areaBand: result.areaBand },
    // Unlimited reports a large remaining rather than 0 — every consumer of
    // this field treats 0 as "blocked", and reporting a visitor blocked when
    // no limit is configured is how the old bug would come back wearing a
    // different hat.
    remainingSession: sessionLimit > 0 ? Math.max(0, sessionLimit - charged.used) : 99,
    photoPath,
    photoPaths,
    photoCount: images.length,
  };
}

// ---------------------------------------------------------------------------
// pricing + persistence
// ---------------------------------------------------------------------------

export interface PersistQuoteRequest {
  mode: WidgetMode;
  surface: Surface;
  prototypeId: string | null;
  sessionId: string;
  vertical: string;
  /**
   * PHASE 11: the vertical's own answers. Widened from PricingInput as a
   * UNION rather than a replacement, so every Phase 4-10 caller that hands
   * over an epoxy PricingInput keeps compiling and keeps working — epoxy's
   * inputSchema accepts exactly that shape.
   */
  input: PricingInput | Record<string, unknown>;
  usedAiAnalysis: boolean;
  /** Phase 6: Storage path from a successful analyzePhotoAction upload, if any. */
  photoPath?: string | null;
}

export interface PersistQuoteResponse {
  publicId: string | null;
  lowCents: number;
  highCents: number;
  error?: string;
}

/**
 * Recomputes the price SERVER-SIDE from the stored quote_config and persists
 * it. The client's numbers are never trusted or written: a vertical's price()
 * is isomorphic so the slider can feel instant, and this action is what makes
 * the persisted figure authoritative.
 *
 * priceQuote() validates the rules against the vertical's strict schema AND
 * the answers against its input schema before computing anything, which is the
 * two-layer check the previous version did by hand.
 */
export async function persistQuoteAction(req: PersistQuoteRequest): Promise<PersistQuoteResponse> {
  const evtCtx = { surface: req.surface, mode: req.mode, sessionId: req.sessionId, prototypeId: req.prototypeId };
  const db = getSupabaseAdminClient();

  const { data: config, error: configErr } = await db
    .from('quote_configs')
    .select('rules, sqft_min, sqft_max')
    .eq('prototype_id', req.prototypeId ?? '')
    .eq('vertical', req.vertical)
    .maybeSingle();

  if (configErr || !config) {
    return { publicId: null, lowCents: 0, highCents: 0, error: 'no_quote_config' };
  }

  let computation: QuoteComputationOf<unknown>;
  try {
    computation = priceQuote({
      verticalId: req.vertical,
      rawInputs: {
        ...(req.input as Record<string, unknown>),
        sqftMin: config.sqft_min,
        sqftMax: config.sqft_max,
      },
      rawRules: config.rules,
    });
  } catch (e) {
    const code = e instanceof PricingError ? e.code : 'pricing_failed';
    return { publicId: null, lowCents: 0, highCents: 0, error: code };
  }

  trackServer(
    'quote_calculated',
    { low_cents: computation.lowCents, high_cents: computation.highCents, used_ai_analysis: req.usedAiAnalysis },
    evtCtx
  );

  // 'preview' and 'prototype' produce a real price and write nothing.
  if (req.mode !== 'live') {
    return { publicId: null, lowCents: computation.lowCents, highCents: computation.highCents };
  }

  const publicId = generateQuotePublicId();
  const decision = req.prototypeId
    ? await can({ prototypeId: req.prototypeId, tier: null, subscriptionStatus: null }, 'quote.ai_analysis', {
        sessionId: req.sessionId,
        mode: req.mode,
      })
    : null;

  const { error: insertErr } = await db.from('quotes').insert({
    public_id: publicId,
    prototype_id: req.prototypeId,
    vertical: req.vertical,
    inputs: JSON.parse(JSON.stringify(computation.inputs)),
    low_cents: computation.lowCents,
    high_cents: computation.highCents,
    breakdown: JSON.parse(JSON.stringify({
      lines: computation.lines,
      midpointCents: computation.midpointCents,
      modifiersApplied: computation.modifiersApplied,
      minimumApplied: computation.minimumApplied,
      rangeSpreadPct: computation.rangeSpreadPct,
    })),
    used_ai_analysis: req.usedAiAnalysis,
    was_capped: decision ? decision.reason === 'cap_reached' : false,
    session_id: req.sessionId,
    photo_path: req.photoPath ?? null,
  });

  if (insertErr) {
    // The price is still correct and still shown. Losing the shareable link
    // is a smaller failure than losing the quote.
    return { publicId: null, lowCents: computation.lowCents, highCents: computation.highCents, error: 'persist_failed' };
  }

  return { publicId, lowCents: computation.lowCents, highCents: computation.highCents };
}

// ---------------------------------------------------------------------------
// session progression
// ---------------------------------------------------------------------------

export interface TouchSessionRequest {
  sessionId: string;
  surface: Surface;
  mode: WidgetMode;
  prototypeId: string | null;
  step: string;
  abandoned: boolean;
  timeInWidgetMs?: number;
}

/**
 * Records step progression and abandonment. Never throws and never blocks:
 * this is telemetry, and telemetry that can break a funnel is worse than no
 * telemetry.
 */
export async function touchSessionAction(req: TouchSessionRequest): Promise<void> {
  if (req.mode === 'preview') return; // zero writes
  try {
    const db = getSupabaseAdminClient();
    await db.rpc('touch_demo_session', {
      p_session_id: req.sessionId,
      p_surface: req.surface,
      p_prototype_id: req.prototypeId,
      p_step: req.step,
      p_abandoned: req.abandoned,
    });
    if (req.abandoned) {
      trackServer(
        'widget_abandoned',
        { abandoned_step: req.step, time_in_widget_ms: req.timeInWidgetMs ?? 0 },
        { surface: req.surface, mode: req.mode, sessionId: req.sessionId, prototypeId: req.prototypeId }
      );
    }
  } catch {
    /* never surfaces */
  }
}

/**
 * The entitlement snapshot the widget boots with, so Phase 4 knows on first
 * paint whether it is rendering the happy path or the degraded one — rather
 * than starting optimistic and yanking the price away mid-flow.
 */
export async function getWidgetEntitlementAction(args: {
  prototypeId: string | null;
  sessionId: string;
  mode: WidgetMode;
}): Promise<{ degraded: boolean; degradedReason: DbDegradedReason | null; remainingSession: number }> {
  if (!args.prototypeId) return { degraded: false, degradedReason: null, remainingSession: 3 };
  const decision = await can(
    { prototypeId: args.prototypeId, tier: null, subscriptionStatus: null },
    'quote.ai_analysis',
    { sessionId: args.sessionId, mode: args.mode }
  );
  return {
    degraded: decision.degradedMode,
    degradedReason: decision.degradedMode ? toDegradedReason(decision.reason) : null,
    remainingSession: decision.remainingSession,
  };
}
