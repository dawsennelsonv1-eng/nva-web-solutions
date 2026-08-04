'use server';

import { headers } from 'next/headers';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { can } from '@/lib/entitlements/check';
import { PricingError, type PricingInput } from '@/lib/quote/pricing';
import { priceQuote } from '@/lib/quote/price-quote';
import type { QuoteComputationOf } from '@/lib/quote/kit';
import { analyzeFloorPhoto, analysisToPricingHints, type VisionField } from '@/lib/quote/vision';
import { consumeAnalysis, reserveSessionAnalysis } from '@/lib/quote/usage';
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
  imageBase64: string;
  mediaType: 'image/jpeg' | 'image/webp' | 'image/png';
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
    /** PHASE 11: the module's own inputs, keyed by its declared writesTo keys. */
    answers?: Record<string, unknown>;
  };
  degradedReason?: DbDegradedReason;
  /** Plain-language copy for the visitor. Never mentions billing (R-146). */
  message?: string;
  remainingSession?: number;
  /**
   * Phase 6: the Storage path the photo was uploaded to, if the upload
   * succeeded. Threaded through the widget machine and attached to the
   * quote row at persist time — see lib/storage/photos.ts.
   */
  photoPath?: string | null;
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

  // 2 — session reserve, before any spend
  const sessionReserve = await reserveSessionAnalysis(req.sessionId, 3);
  if (!sessionReserve.allowed) {
    trackServer('session_limit_reached', {}, evtCtx);
    return {
      status: 'manual_entry',
      remainingSession: 0,
      message: "You've used your photo analyses for this visit. Enter the details yourself and we'll price it instantly.",
    };
  }

  // 3 — payload
  const payload = validateImagePayload(req.imageBase64, req.mediaType);
  if (!payload.ok) {
    trackServer('photo_rejected', { reason: payload.code === 'image_too_large' ? 'dimensions' : 'unsupported_type' }, evtCtx);
    return { status: 'manual_entry', message: payload.message };
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
    imageBase64: req.imageBase64,
    mediaType: req.mediaType,
    vertical: req.vertical,
    prototypeId: req.prototypeId,
    context: {
      surfaceTypeId: req.surfaceTypeId,
      selections: req.selections ?? {},
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
    return {
      status: 'manual_entry',
      message: "We couldn't read that photo. Tell us about it and we'll price it instantly.",
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
  const photoPath = await uploadFloorPhoto({
    prototypeId: req.prototypeId,
    sessionId: req.sessionId,
    base64: req.imageBase64,
    mediaType: req.mediaType,
  });

  // 6a — PHASE 11. Read the contractor's rules so inferred modifier ids can be
  // filtered against what he actually charges for. A read, after every guard,
  // that cannot change whether the call happened. Before this, an AI-suggested
  // id absent from his config reached the pricing engine and threw
  // unknown_modifier — a paid analysis that produced no price at all.
  const rules = await loadRules(req.prototypeId, req.vertical);
  const hints = analysisToPricingHints(result, rules);

  return {
    status: 'ok',
    hints: { ...hints, handToUser: result.handToUser },
    remainingSession: Math.max(0, 3 - sessionReserve.used),
    photoPath,
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
