import 'server-only';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getVertical } from '@/lib/verticals/registry';
import { ensureVerticalsRegistered } from '@/lib/verticals/manifest';

/**
 * lib/quote/vision.ts — ONE photo-analysis call. Anthropic only, no
 * abstraction layer (Phase 10 adds the router; building it now would be
 * abstraction with a sample size of one).
 *
 * THE BOUNDARY THIS FILE ENFORCES: the model CLASSIFIES, it does not price.
 * Nothing returned here is money. Every field feeds lib/quote/pricing.ts as
 * an input, and pricing works identically when this module returns nothing at
 * all. If this file ever returns a number denominated in cents, that is the
 * defect.
 *
 * NEVER THROWS. Every failure resolves to { status: 'unavailable' } so the
 * caller falls through to manual entry. An exception here would take out a
 * lead capture, and lead capture never stops.
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
      reason:
        | 'not_configured'
        | 'provider_error'
        | 'timeout'
        | 'invalid_json'
        | 'schema'
        | 'rate_limited';
      usage?: VisionUsage;
    };

// ---------------------------------------------------------------------------
// cost accounting
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 25_000;

/**
 * VERIFY — provider pricing changes and these defaults are not authoritative.
 * Set AI_INPUT_COST_PER_MTOK_CENTS / AI_OUTPUT_COST_PER_MTOK_CENTS from the
 * current Anthropic price list before launch. The daily ceiling in guards.ts
 * is only as accurate as these two numbers.
 */
function rateCentsPerMillion(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function computeCostCents(inputTokens: number, outputTokens: number): number {
  const inRate = rateCentsPerMillion('AI_INPUT_COST_PER_MTOK_CENTS', 100);
  const outRate = rateCentsPerMillion('AI_OUTPUT_COST_PER_MTOK_CENTS', 500);
  const cents =
    (inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate;
  // Round UP: under-reporting cost defeats the point of a spend ceiling.
  return Math.ceil(cents);
}

// ---------------------------------------------------------------------------
// the call
// ---------------------------------------------------------------------------

interface AnthropicTextBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicTextBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

type Message = { role: 'user' | 'assistant'; content: unknown };

async function callAnthropic(
  messages: Message[],
  apiKey: string,
  model: string,
  maxTokens: number
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        // HARD CAP per call. A classification answer is ~200 tokens; this
        // bounds the worst case if the model ever decides to narrate.
        max_tokens: maxTokens,
        messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = new Error('anthropic ' + res.status);
      (err as Error & { statusCode?: number }).statusCode = res.status;
      throw err;
    }

    const json = (await res.json()) as AnthropicResponse;
    const text = (json.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('');
    return {
      text,
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Models sometimes wrap JSON in fences despite instructions. Strip, do not fail. */
function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced && fenced[1]) return fenced[1].trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
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

async function recordJob(args: {
  prototypeId: string | null;
  model: string;
  status: 'succeeded' | 'failed' | 'invalid_output';
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  error?: string;
}): Promise<void> {
  try {
    const db = getSupabaseAdminClient();
    await db.from('ai_jobs').insert({
      prototype_id: args.prototypeId,
      job_type: 'vision_analysis',
      provider: 'anthropic',
      model: args.model,
      input_tokens: args.inputTokens,
      output_tokens: args.outputTokens,
      cost_cents: args.costCents,
      status: args.status,
      error: args.error ?? null,
    });
  } catch {
    /* cost logging must never fail the request */
  }
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
 */
export async function analyzeFloorPhoto(args: AnalyzeArgs): Promise<VisionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { status: 'unavailable', reason: 'not_configured' };

  const model = process.env.AI_VISION_MODEL ?? DEFAULT_MODEL;
  const maxTokensRaw = Number.parseInt(process.env.AI_MAX_OUTPUT_TOKENS ?? '', 10);
  const maxTokens = Number.isFinite(maxTokensRaw) && maxTokensRaw > 0 ? maxTokensRaw : DEFAULT_MAX_TOKENS;

  ensureVerticalsRegistered();
  let prompt: string;
  try {
    prompt = getVertical(args.vertical).photoAnalysisPrompt;
  } catch {
    return { status: 'unavailable', reason: 'not_configured' };
  }

  const messages: Message[] = [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: args.mediaType, data: args.imageBase64 },
        },
        { type: 'text', text: prompt },
      ],
    },
  ];

  let totalIn = 0;
  let totalOut = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let text: string;
    try {
      const res = await callAnthropic(messages, apiKey, model, maxTokens);
      text = res.text;
      totalIn += res.inputTokens;
      totalOut += res.outputTokens;
    } catch (e) {
      const cost = computeCostCents(totalIn, totalOut);
      const aborted = e instanceof Error && e.name === 'AbortError';
      const status = (e as { statusCode?: number }).statusCode;
      const reason = aborted ? 'timeout' : status === 429 ? 'rate_limited' : 'provider_error';
      await recordJob({
        prototypeId: args.prototypeId,
        model,
        status: 'failed',
        inputTokens: totalIn,
        outputTokens: totalOut,
        costCents: cost,
        error: reason,
      });
      return { status: 'unavailable', reason };
    }

    let parsedUnknown: unknown;
    try {
      parsedUnknown = JSON.parse(extractJson(text));
    } catch {
      if (attempt === 0) {
        messages.push({ role: 'assistant', content: text });
        messages.push({
          role: 'user',
          content:
            'That was not valid JSON. Reply with ONLY the JSON object described above, no prose and no code fences.',
        });
        continue;
      }
      const cost = computeCostCents(totalIn, totalOut);
      await recordJob({
        prototypeId: args.prototypeId, model, status: 'invalid_output',
        inputTokens: totalIn, outputTokens: totalOut, costCents: cost, error: 'invalid_json',
      });
      return { status: 'unavailable', reason: 'invalid_json' };
    }

    const validated = floorAnalysisSchema.safeParse(parsedUnknown);
    if (!validated.success) {
      if (attempt === 0) {
        const complaint = validated.error.issues
          .map((i) => i.path.join('.') + ': ' + i.message)
          .join('; ');
        messages.push({ role: 'assistant', content: text });
        messages.push({
          role: 'user',
          content:
            'That JSON did not match the required shape. Problems: ' +
            complaint +
            '. Reply with ONLY a corrected JSON object.',
        });
        continue;
      }
      const cost = computeCostCents(totalIn, totalOut);
      await recordJob({
        prototypeId: args.prototypeId, model, status: 'invalid_output',
        inputTokens: totalIn, outputTokens: totalOut, costCents: cost, error: 'schema',
      });
      return { status: 'unavailable', reason: 'schema' };
    }

    const costCents = computeCostCents(totalIn, totalOut);
    await recordJob({
      prototypeId: args.prototypeId, model, status: 'succeeded',
      inputTokens: totalIn, outputTokens: totalOut, costCents,
    });

    return {
      status: 'ok',
      analysis: validated.data,
      handToUser: lowConfidenceFields(validated.data),
      usage: { model, inputTokens: totalIn, outputTokens: totalOut, costCents },
    };
  }

  return { status: 'unavailable', reason: 'provider_error' };
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
