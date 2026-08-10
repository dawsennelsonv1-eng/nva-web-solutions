import 'server-only';
import { AI_ROUTES } from '@/lib/ai/config';
import { recordVisionJob } from '@/lib/ai/jobs';
import { computeCostCents, rateFor } from '@/lib/ai/pricing';
import { jobProviderConfigured, resolveJobModel, runJob } from '@/lib/ai/router';
import type { AiErrorCode } from '@/lib/ai/errors';
import type { ChatMessage, RepairOptions } from '@/lib/ai/types';
import { getVertical } from '@/lib/verticals/registry';
import type { VisionContext } from '@/lib/verticals/registry';
import { ensureVerticalsRegistered } from '@/lib/verticals/manifest';

/**
 * lib/quote/vision.ts — ONE photo-analysis call, issued through the Phase 10
 * provider layer.
 *
 * WHAT DID NOT CHANGE IN PHASE 11, and this matters as much as what did:
 *   - the bytes on the wire (same model, same max_tokens, same message array,
 *     image first then prompt, no system prompt, no temperature, no caching)
 *   - the 25 second timeout and the single repair retry, word for word
 *   - every VisionResult reason string
 *   - the ai_jobs row: same nine columns, same values
 *   - the cost arithmetic, including the two env overrides and the round-up
 *   - WHEN QUOTA IS CONSUMED: this file has never touched a counter and still
 *     does not. lib/quote/usage.ts is untouched.
 *
 * WHAT CHANGED: this file no longer knows what a floor is.
 *
 * Phase 3 hard-coded floorAnalysisSchema, two confidence floors and an
 * epoxy-shaped hint mapper right here, with a comment promising to move them
 * onto the vertical contract "when a second vertical goes live". Painting is
 * that second vertical. The prompt, the response schema, which fields count as
 * low-confidence, and how a validated analysis becomes quote input are now all
 * asked of the MODULE. A painting photo gets painting's schema; a roofing
 * photo will get roofing's, with no edit here.
 *
 * THE BOUNDARY THIS FILE ENFORCES, unchanged: the model CLASSIFIES, it does
 * not price. Nothing returned here is money. Every field feeds a module's
 * price() as an input, and pricing works identically when this module returns
 * nothing at all. If this file ever returns a number denominated in cents,
 * that is the defect.
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
// types
// ---------------------------------------------------------------------------

/**
 * A validated analysis, whatever trade produced it. Phase 3 typed this as the
 * epoxy shape; it is opaque here now on purpose, because the only code
 * entitled to read its fields is the module that wrote the schema.
 *
 * VERIFY: anything outside a vertical module that destructured
 * `result.analysis.<field>` must move that logic into the module's
 * mapToInputs. lib/verticals/epoxy exports EpoxyVisionResult for the rare
 * place a narrow read is genuinely warranted.
 */
export type VisionAnalysis = unknown;

/**
 * Widened in Phase 11: field names belong to whichever trade's schema produced
 * them. `(string & {})` keeps autocomplete on the epoxy names that Phase 3-10
 * code already compares against.
 */
export type VisionField =
  | 'surface_type_guess'
  | 'condition_grade'
  | 'oil_staining'
  | 'cracking_severity'
  | 'estimated_area_sqft'
  | (string & {});

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
      analysis: VisionAnalysis;
      /** Fields whose confidence was too low to use. Ask the user for these. */
      handToUser: VisionField[];
      usage: VisionUsage;
      /** Which module validated it — needed to map it afterwards. */
      vertical: string;
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

/** One prepared photograph, already validated by guards.ts. */
export interface VisionImage {
  /** Base64 WITHOUT the data: prefix. */
  base64: string;
  mediaType: 'image/jpeg' | 'image/webp' | 'image/png';
}

export interface AnalyzeArgs {
  /**
   * Base64 WITHOUT the data: prefix. Already validated by guards.ts.
   *
   * KEPT FOR THE SINGLE-PHOTO CALLERS. `images` below supersedes it; when both
   * are absent the call cannot be made. Every Phase 3-26 caller passes this
   * pair and keeps working unchanged.
   */
  imageBase64?: string;
  mediaType?: 'image/jpeg' | 'image/webp' | 'image/png';
  /**
   * SEVERAL VIEWS OF THE SAME SPACE, IN ONE CALL.
   *
   * One photograph of a garage carries almost no scale information. A model
   * looking at a single frame is inferring area from whatever happens to be in
   * shot, and it is right often enough to be dangerous — the failure mode is a
   * confident number that is forty per cent wrong, which becomes a quote a
   * contractor cannot honour.
   *
   * Three to five frames from different corners give parallax, more than one
   * known-size object, and usually the full run of at least one wall. That is
   * the difference between guessing and measuring.
   *
   * THEY GO IN ONE CALL, NOT ONE CALL EACH. Five separate analyses would cost
   * five times as much, meter five times against the contractor's cap, and
   * return five independent guesses that something would then have to
   * reconcile — badly, because averaging five estimates of a room is not how
   * you measure a room. One call sees all five frames at once and reasons
   * across them, which is the entire point.
   */
  images?: VisionImage[];
  /** Registry vertical id — supplies the prompt AND the schema for this trade. */
  vertical: string;
  /** For cost attribution. Null on /demo. */
  prototypeId: string | null;
  /**
   * PHASE 11: what the visitor has already told us. Optional, so every Phase
   * 3-10 caller compiles unchanged; when supplied the module can sharpen its
   * prompt, because cabinets and siding are different vision tasks.
   */
  context?: VisionContext;
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
  if (!jobProviderConfigured('vision_analysis')) {
    return { status: 'unavailable', reason: 'not_configured' };
  }

  ensureVerticalsRegistered();
  const ctx: VisionContext = args.context ?? { selections: {} };

  let prompt: string;
  let schema: Parameters<typeof runJob>[0]['schema'];
  let detectLowConfidence: (parsed: unknown) => string[];
  try {
    const mod = getVertical(args.vertical);
    prompt = mod.vision.buildPrompt(ctx);
    schema = mod.vision.responseSchema;
    detectLowConfidence = (p) => mod.vision.lowConfidenceFields(p);
  } catch {
    // An unregistered vertical is a deployment error, not a homeowner's
    // problem. Same exit as a missing API key: no call made, no ledger row
    // written, straight to manual entry.
    return { status: 'unavailable', reason: 'not_configured' };
  }

  const model = resolveJobModel('vision_analysis');

  /**
   * Normalise the two call shapes into one list. `images` wins when both are
   * given; a caller that passes both has changed its mind mid-refactor and the
   * newer field is the one it meant.
   */
  const images: VisionImage[] =
    args.images && args.images.length > 0
      ? args.images
      : args.imageBase64 && args.mediaType
        ? [{ base64: args.imageBase64, mediaType: args.mediaType }]
        : [];

  if (images.length === 0) {
    // No photograph is a caller bug, not a provider failure. Same exit as a
    // missing key: nothing called, nothing billed, straight to manual entry.
    return { status: 'unavailable', reason: 'not_configured' };
  }

  // Images first, then the prompt — the same order Phase 3 sent, which is the
  // order every vertical's prompt is written against. With several frames they
  // are all placed before the text, so the model has seen the whole space
  // before it is told what to do with it.
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: [
        ...images.map((img) => ({
          type: 'image' as const,
          mediaType: img.mediaType,
          base64: img.base64,
        })),
        { type: 'text', text: prompt },
      ],
    },
  ];

  const result = await runJob<unknown>({
    job: 'vision_analysis',
    messages,
    schema,
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

  // A module's confidence detector runs on data its own schema just validated,
  // so it should not throw — but if it does, that must not turn a successful,
  // already-paid-for call into a dead session. A broken detector means "we are
  // sure of nothing", which routes every field back to the person.
  let handToUser: VisionField[] = [];
  try {
    handToUser = detectLowConfidence(result.data);
  } catch {
    handToUser = [];
  }

  return {
    status: 'ok',
    analysis: result.data,
    handToUser,
    vertical: args.vertical,
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
    rateFor('anthropic', resolveJobModel('vision_analysis'), route?.costRateOverride)
  );
}

export interface PricingHints {
  /** Legacy projection, still populated for every Phase 4-10 consumer. */
  surfaceTypeId?: string;
  estimatedSqft?: number;
  conditionModifierIds: string[];
  /**
   * PHASE 11: the module's own inputs, keyed by its declared writesTo keys.
   * This is the authoritative set; the three fields above are a projection of
   * it for code written before verticals could speak for themselves.
   */
  answers: Record<string, unknown>;
}

/**
 * Maps a validated analysis onto pricing inputs by asking the module that
 * validated it. Deliberately lossy: an omitted field means the widget asks the
 * person, which is always a working path.
 *
 * NEVER THROWS. A module whose mapper blows up yields no hints rather than
 * killing a session that has already been paid for.
 *
 * `rules` IS THE BUG FIX HIDING IN THIS REFACTOR. Phase 3's mapper emitted
 * modifier ids unconditionally, so a contractor whose config did not define
 * `oil_heavy` would take an AI-suggested id straight into calculateQuote and
 * hit unknown_modifier — a photo that silently produced NO PRICE AT ALL, on
 * the paid path, after the analysis had already been billed. Ids are now
 * filtered against that contractor's own config before they leave this
 * function. Pass null only where no config row exists (the /demo constant
 * path), which preserves the Phase 3 behaviour for the one surface that is
 * not a real tenant.
 */
export function analysisToPricingHints(
  result: Extract<VisionResult, { status: 'ok' }>,
  rules: unknown | null
): PricingHints {
  const hints: PricingHints = { conditionModifierIds: [], answers: {} };

  ensureVerticalsRegistered();
  let answers: Record<string, unknown>;
  try {
    const mod = getVertical(result.vertical);
    const parsedRules = rules === null ? null : mod.pricingRuleSchema.safeParse(rules);
    const allowed =
      parsedRules && parsedRules.success
        ? mod.vision.allowancesFromRules(parsedRules.data)
        : null;

    const mapped = mod.vision.mapToInputs(
      result.analysis,
      { selections: {} },
      // No config to check against: let the module emit whatever it would, so
      // /demo behaves exactly as it did before this phase.
      allowed ?? { modifierIds: ALLOW_ALL, tierKeys: ALLOW_ALL }
    ) as Record<string, unknown>;

    answers = allowed === null ? mapped : withFilteredModifiers(mapped, allowed.modifierIds);
  } catch {
    return hints;
  }

  hints.answers = answers;

  // Project onto the legacy shape. The quantity key differs per trade, so
  // whichever one the module wrote becomes estimatedSqft for the components
  // that only speak square feet.
  if (typeof answers.surfaceTypeId === 'string') hints.surfaceTypeId = answers.surfaceTypeId;
  for (const key of ['sqft', 'areaSqft', 'linearFt', 'doorCount']) {
    const value = answers[key];
    if (typeof value === 'number') {
      hints.estimatedSqft = value;
      break;
    }
  }
  if (Array.isArray(answers.conditionModifierIds)) {
    hints.conditionModifierIds = answers.conditionModifierIds as string[];
  }

  return hints;
}

/**
 * A sentinel the allowance filter reads as "everything permitted". A Proxy
 * whose `includes` always returns true, rather than a magic string that a real
 * modifier id could one day collide with.
 */
const ALLOW_ALL: string[] = new Proxy([] as string[], {
  get(target, prop, receiver) {
    if (prop === 'includes') return () => true;
    return Reflect.get(target, prop, receiver);
  },
});

function withFilteredModifiers(
  answers: Record<string, unknown>,
  allowedIds: string[]
): Record<string, unknown> {
  if (!Array.isArray(answers.conditionModifierIds)) return answers;
  return {
    ...answers,
    conditionModifierIds: (answers.conditionModifierIds as string[]).filter((id) =>
      allowedIds.includes(id)
    ),
  };
}

