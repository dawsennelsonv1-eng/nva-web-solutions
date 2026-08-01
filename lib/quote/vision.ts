import 'server-only';
import { z } from 'zod';
import { AI_ROUTES } from '@/lib/ai/config';
import { recordVisionJob } from '@/lib/ai/jobs';
import { computeCostCents, rateFor } from '@/lib/ai/pricing';
import { jobProviderConfigured, resolveJobModel, runJob } from '@/lib/ai/router';
import type { AiErrorCode } from '@/lib/ai/errors';
import type { ChatMessage, RepairOptions } from '@/lib/ai/types';
import { getVertical } from '@/lib/verticals/registry';
import { ensureVerticalsRegistered } from '@/lib/verticals/manifest';

/**
 * lib/quote/vision.ts — ONE photo-analysis call, now issued through the
 * Phase 10 provider layer instead of a hand-rolled fetch.
 *
 * WHAT DID NOT CHANGE, and this is the whole point of the migration:
 *   - the bytes on the wire (same model, same max_tokens, same message array,
 *     no system prompt, no temperature, no caching)
 *   - the 25 second timeout and the single repair retry, word for word
 *   - every VisionResult reason string
 *   - the ai_jobs row: same nine columns, same values, provider 'anthropic'
 *   - the cost arithmetic, including the two env overrides and the round-up
 *   - WHEN QUOTA IS CONSUMED: this file has never touched a counter and still
 *     does not. lib/quote/usage.ts is untouched by this phase.
 *
 * WHAT CHANGED: the HTTP call, JSON extraction, schema repair and ledger write
 * are now shared code. That is it.
 *
 * THE BOUNDARY THIS FILE ENFORCES: the model CLASSIFIES, it does not price.
 * Nothing returned here is money. Every field feeds lib/quote/pricing.ts as
 * an input, and pricing works identically when this module returns nothing at
 * all. If this file ever returns a number denominated in cents, that is the
 * defect.
 *
 * NEVER THROWS. Every failure resolves to { status: 'unavailable' } so the
 * caller falls through to manual entry. An exception here would take out a
 * lead capture, and lead capture never stops. The router is also written never
 * to throw, so this holds on both sides of the seam.
 *
 * NOT SUBJECT TO THE PHASE 10 DAILY CEILING. The vision_analysis route sets
 * honorDailyCeiling: false because this path already sits behind the ceiling
 * in lib/quote/guards.ts, and because a homeowner mid-quote must never be
 * refused by a budget an admin spent writing website copy.
 */

// ---------------------------------------------------------------------------
// the validated shape (epoxy)
// ---------------------------------------------------------------------------

const confidenceSchema = z.number().min(0).max(1);

/**
 * Mirrors the JSON contract in lib/verticals/epoxy's photoAnalysisPrompt.
 *
 * PHASE 11 NOTE: when a second vertical goes live this schema moves onto the
 * VerticalModule contract beside photoAnalysisPrompt, since prompt and
 * response schema are one artifact. It lives here while epoxy is the only
 * vertical making paid calls, so registry.ts does not have to change twice.
 */
export const floorAnalysisSchema = z.object({
  surface_type_guess: z.enum(['garage', 'patio', 'commercial', 'unknown']),
  condition_grade: z.enum(['good', 'fair', 'poor', 'unknown']),
  damage_flags: z.array(
    z.enum(['cracking', 'spalling', 'pitting', 'previous_coating', 'moisture_signs'])
  ),
  oil_staining: z.enum(['none', 'light', 'heavy', 'unknown']),
  cracking_severity: z.enum(['none', 'hairline', 'moderate', 'severe', 'unknown']),
  estimated_area_sqft: z.number().positive().nullable(),
  confidence: z.object({
    surface_type_guess: confidenceSchema,
    condition_grade: confidenceSchema,
    oil_staining: confidenceSchema,
    cracking_severity: confidenceSchema,
    estimated_area_sqft: confidenceSchema,
  }),
});

export type FloorAnalysis = z.infer<typeof floorAnalysisSchema>;

/**
 * Below this, we do NOT use the model's answer — we hand the field to the
 * person with plain copy ("we couldn't tell from the photo — which is it?").
 * A confidently-wrong surface classification produces a confidently-wrong
 * price, and a wrong price in front of a homeowner is the single most
 * expensive failure this product can have. Silence is cheaper than a guess.
 */
export const CONFIDENCE_FLOOR = 0.6;

/**
 * Area is held to a HIGHER bar than the categorical fields. Getting the
 * finish wrong shifts the price by a rate; getting the area wrong scales the
 * entire quote linearly, and the homeowner is the one person in the
 * transaction who can actually measure their own garage.
 */
export const AREA_CONFIDENCE_FLOOR = 0.8;

export type VisionField =
  | 'surface_type_guess'
  | 'condition_grade'
  | 'oil_staining'
  | 'cracking_severity'
  | 'estimated_area_sqft';

export interface VisionUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

export type VisionUnavailableReason =
  | 'not_configured'
  | 'provider_error'
  | 'timeout'
  | 'invalid_json'
  | 'schema'
  | 'rate_limited';

export type VisionResult =
  | {
      status: 'ok';
      analysis: FloorAnalysis;
      /** Fields whose confidence was too low to use. Ask the user for these. */
      handToUser: VisionField[];
      usage: VisionUsage;
    }
  | {
      status: 'unavailable';
      reason: VisionUnavailableReason;
      usage?: VisionUsage;
    };

// ---------------------------------------------------------------------------
// the repair wording, pinned
// ---------------------------------------------------------------------------

/**
 * Byte-identical to the sentences Phase 3 sent. Pinned here rather than
 * inherited from the provider layer's default so that improving the default
 * wording for admin jobs can never quietly change what a homeowner's photo
 * analysis asks the model to do.
 */
const VISION_REPAIR: RepairOptions = {
  enabled: true,
  invalidJsonMessage:
    'That was not valid JSON. Reply with ONLY the JSON object described above, no prose and no code fences.',
  schemaMessagePrefix: 'That JSON did not match the required shape. Problems: ',
  schemaMessageSuffix: '. Reply with ONLY a corrected JSON object.',
};

/** Provider-layer codes mapped back onto the reasons this module has always returned. */
function reasonFor(code: AiErrorCode): VisionUnavailableReason {
  switch (code) {
    case 'timeout':
      return 'timeout';
    case 'rate_limited':
      return 'rate_limited';
    case 'invalid_json':
      return 'invalid_json';
    case 'schema':
      return 'schema';
    case 'not_configured':
      return 'not_configured';
    default:
      // auth, overloaded, invalid_request, content_filter, aborted and
      // anything new all land here, exactly as a non-429 HTTP failure did
      // before this file was migrated.
      return 'provider_error';
  }
}

function lowConfidenceFields(a: FloorAnalysis): VisionField[] {
  const out: VisionField[] = [];
  const c = a.confidence;
  if (a.surface_type_guess === 'unknown' || c.surface_type_guess < CONFIDENCE_FLOOR) out.push('surface_type_guess');
  if (a.condition_grade === 'unknown' || c.condition_grade < CONFIDENCE_FLOOR) out.push('condition_grade');
  if (a.oil_staining === 'unknown' || c.oil_staining < CONFIDENCE_FLOOR) out.push('oil_staining');
  if (a.cracking_severity === 'unknown' || c.cracking_severity < CONFIDENCE_FLOOR) out.push('cracking_severity');
  if (a.estimated_area_sqft === null || c.estimated_area_sqft < AREA_CONFIDENCE_FLOOR) out.push('estimated_area_sqft');
  return out;
}

export interface AnalyzeArgs {
  /** Base64 WITHOUT the data: prefix. Already validated by guards.ts. */
  imageBase64: string;
  mediaType: 'image/jpeg' | 'image/webp' | 'image/png';
  /** Registry vertical id — supplies the prompt for this trade. */
  vertical: string;
  /** For cost attribution. Null on /demo. */
  prototypeId: string | null;
}

/**
 * ONE analysis, with ONE repair retry, then manual entry.
 *
 * The repair attempt sends the model its own malformed output plus the
 * validator's complaint. It is worth exactly one try: the failure mode it
 * fixes (a stray sentence before the JSON, a missing field) is common and
 * cheap, while a second repair on a model that has already failed twice is
 * money spent on a coin flip. After that we hand the whole thing to the user,
 * which is a path that always works.
 *
 * The retry now lives in lib/ai/providers/base.ts. The policy — one try, then
 * stop — did not move.
 */
export async function analyzeFloorPhoto(args: AnalyzeArgs): Promise<VisionResult> {
  if (!jobProviderConfigured('vision_analysis')) {
    return { status: 'unavailable', reason: 'not_configured' };
  }

  ensureVerticalsRegistered();
  let prompt: string;
  try {
    prompt = getVertical(args.vertical).photoAnalysisPrompt;
  } catch {
    return { status: 'unavailable', reason: 'not_configured' };
  }

  const model = resolveJobModel('vision_analysis');

  // Image first, then the prompt — the same order Phase 3 sent, which is the
  // order the epoxy prompt is written against.
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'image', mediaType: args.mediaType, base64: args.imageBase64 },
        { type: 'text', text: prompt },
      ],
    },
  ];

  const result = await runJob<FloorAnalysis>({
    job: 'vision_analysis',
    messages,
    schema: floorAnalysisSchema,
    repair: VISION_REPAIR,
    prototypeId: args.prototypeId,
  });

  if (!result.ok) {
    const reason = reasonFor(result.error.code);
    // A missing key never produced a ledger row before this phase and still
    // does not: nothing was called, so there is nothing to bill.
    if (reason !== 'not_configured') {
      await recordVisionJob({
        prototypeId: args.prototypeId,
        model,
        status: reason === 'invalid_json' || reason === 'schema' ? 'invalid_output' : 'failed',
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costCents: result.costCents,
        error: reason,
      });
    }
    return { status: 'unavailable', reason };
  }

  await recordVisionJob({
    prototypeId: args.prototypeId,
    model: result.model,
    status: 'succeeded',
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    costCents: result.costCents,
  });

  return {
    status: 'ok',
    analysis: result.data,
    handToUser: lowConfidenceFields(result.data),
    usage: {
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costCents: result.costCents,
    },
  };
}

/**
 * The cost of one analysis at the rates currently configured, without making
 * a call. Exposed so guards.ts and the admin dashboard can talk about vision
 * spend using the same arithmetic the ledger uses, rather than their own.
 */
export function visionCostCents(inputTokens: number, outputTokens: number): number {
  const route = AI_ROUTES.vision_analysis;
  return computeCostCents(
    {
      inputTokens,
      outputTokens,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      estimated: false,
    },
    rateFor('anthropic', resolveJobModel('vision_analysis'), route.costRateOverride)
  );
}

/**
 * Maps a validated analysis onto pricing inputs, dropping every field the
 * confidence floors rejected. This is the ONLY place vision output becomes
 * quote input, and it is deliberately lossy: an omitted field means Phase 4
 * asks the user, which is always a working path.
 */
export function analysisToPricingHints(
  result: Extract<VisionResult, { status: 'ok' }>
): {
  surfaceTypeId?: string;
  estimatedSqft?: number;
  conditionModifierIds: string[];
} {
  const { analysis, handToUser } = result;
  const hints: { surfaceTypeId?: string; estimatedSqft?: number; conditionModifierIds: string[] } = {
    conditionModifierIds: [],
  };

  if (!handToUser.includes('surface_type_guess') && analysis.surface_type_guess !== 'unknown') {
    hints.surfaceTypeId = analysis.surface_type_guess;
  }
  if (!handToUser.includes('estimated_area_sqft') && analysis.estimated_area_sqft !== null) {
    hints.estimatedSqft = Math.round(analysis.estimated_area_sqft);
  }
  if (!handToUser.includes('oil_staining') && analysis.oil_staining === 'heavy') {
    hints.conditionModifierIds.push('oil_heavy');
  }
  if (
    !handToUser.includes('cracking_severity') &&
    (analysis.cracking_severity === 'moderate' || analysis.cracking_severity === 'severe')
  ) {
    hints.conditionModifierIds.push('cracking_moderate');
  }
  if (analysis.damage_flags.includes('previous_coating')) {
    hints.conditionModifierIds.push('previous_coating');
  }
  return hints;
}
