import type { JobId, ProviderId } from './types';

/**
 * lib/ai/config.ts — THE ONE FILE YOU EDIT to change which model does what.
 *
 * Nothing else in lib/ai names a model or a price. If you want site copy
 * written by Kimi instead of Claude, you change one array here and push; no
 * adapter, route or prompt is touched.
 *
 * Order in `chain` is priority order. The router walks it top to bottom and
 * stops at the first provider that both has a key and answers.
 */

export interface RouteCandidate {
  provider: ProviderId;
  /** Model id sent to the provider. */
  model: string;
  /** Optional env var that overrides `model` without a redeploy of this file. */
  modelEnv?: string;
  /** HARD per-request output cap. Clamped to HARD_MAX_OUTPUT_TOKENS regardless. */
  maxOutputTokens: number;
  maxOutputTokensEnv?: string;
  temperature?: number;
  /** Ask for protocol-level JSON where the provider has it. Anthropic has none. */
  jsonMode?: boolean;
  /** Mark the system prompt cacheable where the provider supports it. */
  cache?: boolean;
  timeoutMs?: number;
}

export interface RouteConfig {
  label: string;
  /** Shown in the admin panel under the job name. Plain language, no jargon. */
  description: string;
  chain: RouteCandidate[];
  /**
   * Whether the server-side daily spend ceiling applies. FALSE for vision only,
   * because vision already sits behind the ceiling in lib/quote/guards.ts and
   * because a homeowner mid-quote must never be blocked by an admin's copy
   * experiments. Two ceilings on one call would refuse twice and confuse both.
   */
  honorDailyCeiling: boolean;
  /** Whether the router writes the ai_jobs row, or the caller does it itself. */
  record: boolean;
  /** Try the next provider when the model returns unusable JSON twice. */
  fallbackOnValidationFailure: boolean;
  /** Whether the one repair retry is offered at all. */
  repair: boolean;
  /**
   * Fixed cost rates for this route, overriding the per-model table. Vision
   * uses this so its cost arithmetic is byte-identical to Phase 3.
   */
  costRateOverride?: {
    inputEnv: string;
    inputDefaultCentsPerMTok: number;
    outputEnv: string;
    outputDefaultCentsPerMTok: number;
  };
}

/**
 * NOTHING gets to ask for more than this, whatever the route says. A prompt
 * injection that talks a job into "write the full 40-page site" cannot cost
 * more than this many output tokens.
 */
export const HARD_MAX_OUTPUT_TOKENS = 4000;

/** Fallback ceiling in cents/day when AI_DAILY_SPEND_CEILING_CENTS is unset. */
export const DEFAULT_DAILY_CEILING_CENTS = 500;

/** Admin AI runs allowed per minute, per admin. Overridden by AI_ADMIN_RATE_PER_MIN. */
export const DEFAULT_ADMIN_RATE_PER_MIN = 6;

/** Admin AI runs allowed per UTC day, all admins. Overridden by AI_ADMIN_RATE_PER_DAY. */
export const DEFAULT_ADMIN_RATE_PER_DAY = 200;

export interface CostRate {
  inputCentsPerMTok: number;
  outputCentsPerMTok: number;
  /** Multiplier applied to tokens read from a warm cache. */
  cachedReadMultiplier: number;
  /** Multiplier applied to tokens written into the cache. */
  cacheWriteMultiplier: number;
}

/**
 * VERIFY — every number below is a list price from memory, not from an
 * invoice. Confirm each against the provider's current pricing page before you
 * trust the daily ceiling. Cost is reported in CENTS PER MILLION TOKENS.
 * Unknown model ids fall through to PROVIDER_DEFAULT_RATES, which are
 * deliberately pessimistic so an unpriced model over-reports rather than
 * under-reports spend.
 */
export const MODEL_RATES: Record<string, CostRate> = {
  // Anthropic
  'anthropic:claude-haiku-4-5-20251001': {
    inputCentsPerMTok: 100,
    outputCentsPerMTok: 500,
    cachedReadMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
  },
  'anthropic:claude-sonnet-5': {
    inputCentsPerMTok: 300,
    outputCentsPerMTok: 1500,
    cachedReadMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
  },
  // OpenAI
  'openai:gpt-4o': {
    inputCentsPerMTok: 250,
    outputCentsPerMTok: 1000,
    cachedReadMultiplier: 0.5,
    cacheWriteMultiplier: 1,
  },
  'openai:gpt-4o-mini': {
    inputCentsPerMTok: 15,
    outputCentsPerMTok: 60,
    cachedReadMultiplier: 0.5,
    cacheWriteMultiplier: 1,
  },
  // Moonshot / Kimi
  'moonshot:moonshot-v1-32k': {
    inputCentsPerMTok: 240,
    outputCentsPerMTok: 240,
    cachedReadMultiplier: 0.1,
    cacheWriteMultiplier: 1,
  },
};

export const PROVIDER_DEFAULT_RATES: Record<ProviderId, CostRate> = {
  anthropic: {
    inputCentsPerMTok: 300,
    outputCentsPerMTok: 1500,
    cachedReadMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
  },
  openai: {
    inputCentsPerMTok: 250,
    outputCentsPerMTok: 1000,
    cachedReadMultiplier: 0.5,
    cacheWriteMultiplier: 1,
  },
  moonshot: {
    inputCentsPerMTok: 240,
    outputCentsPerMTok: 240,
    cachedReadMultiplier: 0.1,
    cacheWriteMultiplier: 1,
  },
  compatible: {
    inputCentsPerMTok: 300,
    outputCentsPerMTok: 1500,
    cachedReadMultiplier: 1,
    cacheWriteMultiplier: 1,
  },
};

export const AI_ROUTES: Record<JobId, RouteConfig> = {
  site_copy: {
    label: 'Site copy',
    description: 'Writes the headline, value props, process and FAQ for one trade in one market.',
    chain: [
      {
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        modelEnv: 'AI_MODEL_SITE_COPY',
        maxOutputTokens: 3000,
        temperature: 0.7,
        cache: true,
      },
      {
        provider: 'openai',
        model: 'gpt-4o',
        maxOutputTokens: 3000,
        temperature: 0.7,
        jsonMode: true,
      },
      {
        provider: 'moonshot',
        model: 'moonshot-v1-32k',
        maxOutputTokens: 3000,
        temperature: 0.7,
        jsonMode: true,
      },
    ],
    honorDailyCeiling: true,
    record: true,
    fallbackOnValidationFailure: true,
    repair: true,
  },

  component_restyle: {
    label: 'Component restyle',
    description: 'Proposes new style tokens for one component. Chooses from fixed options only.',
    chain: [
      {
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        modelEnv: 'AI_MODEL_RESTYLE',
        maxOutputTokens: 1500,
        temperature: 0.4,
        cache: true,
      },
      {
        provider: 'openai',
        model: 'gpt-4o-mini',
        maxOutputTokens: 1500,
        temperature: 0.4,
        jsonMode: true,
      },
    ],
    honorDailyCeiling: true,
    record: true,
    fallbackOnValidationFailure: true,
    repair: true,
  },

  quote_params: {
    label: 'Quoting parameters',
    description: 'Suggests changes to pricing inputs. Always a proposal — never applied on its own.',
    chain: [
      {
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        modelEnv: 'AI_MODEL_QUOTE_PARAMS',
        maxOutputTokens: 2000,
        // Money math. The temperature that makes copy interesting makes
        // pricing advice creative, and creative is the wrong adjective here.
        temperature: 0,
        cache: true,
      },
      {
        provider: 'openai',
        model: 'gpt-4o',
        maxOutputTokens: 2000,
        temperature: 0,
        jsonMode: true,
      },
    ],
    honorDailyCeiling: true,
    record: true,
    fallbackOnValidationFailure: true,
    repair: true,
  },

  /**
   * The homeowner-facing path. SINGLE PROVIDER, NO FALLBACK, NO CEILING, NO
   * ROUTER RECORDING — every one of those is deliberate:
   *  - a fallback to a provider whose vision output has never been graded
   *    against this schema is an experiment run on a live quote;
   *  - the ceiling for this path already lives in lib/quote/guards.ts;
   *  - vision.ts writes its own ai_jobs row so the reason strings Phase 3
   *    shipped ('invalid_json', 'schema', 'timeout') survive unchanged.
   */
  vision_analysis: {
    label: 'Photo analysis',
    description: 'Classifies one floor photo. Runs on the public funnel, not from this panel.',
    chain: [
      {
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        modelEnv: 'AI_VISION_MODEL',
        maxOutputTokens: 1024,
        maxOutputTokensEnv: 'AI_MAX_OUTPUT_TOKENS',
        timeoutMs: 25_000,
      },
    ],
    honorDailyCeiling: false,
    record: false,
    fallbackOnValidationFailure: false,
    repair: true,
    costRateOverride: {
      inputEnv: 'AI_INPUT_COST_PER_MTOK_CENTS',
      inputDefaultCentsPerMTok: 100,
      outputEnv: 'AI_OUTPUT_COST_PER_MTOK_CENTS',
      outputDefaultCentsPerMTok: 500,
    },
  },
};

/**
 * Base URLs. Each is env-overridable so a proxy, a regional endpoint or a
 * self-hosted gateway can be swapped in without a code change.
 *
 * VERIFY — Moonshot serves api.moonshot.ai globally and api.moonshot.cn for
 * mainland China accounts. A key issued on one will 401 on the other.
 */
export const PROVIDER_ENDPOINTS: Record<
  ProviderId,
  { baseUrlEnv: string; defaultBaseUrl: string | null; apiKeyEnv: string }
> = {
  anthropic: {
    baseUrlEnv: 'ANTHROPIC_BASE_URL',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },
  openai: {
    baseUrlEnv: 'OPENAI_BASE_URL',
    defaultBaseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  moonshot: {
    baseUrlEnv: 'MOONSHOT_BASE_URL',
    defaultBaseUrl: 'https://api.moonshot.ai/v1',
    apiKeyEnv: 'MOONSHOT_API_KEY',
  },
  compatible: {
    // No default: an OpenAI-compatible adapter with a guessed URL is a way to
    // send your prompts somewhere you did not choose.
    baseUrlEnv: 'AI_COMPATIBLE_BASE_URL',
    defaultBaseUrl: null,
    apiKeyEnv: 'AI_COMPATIBLE_API_KEY',
  },
};

export function getRoute(job: JobId): RouteConfig {
  return AI_ROUTES[job];
}
