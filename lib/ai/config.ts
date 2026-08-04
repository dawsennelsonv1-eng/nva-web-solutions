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
 *
 * === OPENROUTER, AND WHY THERE IS NO NEW ADAPTER ===
 *
 * OpenRouter is a first-class provider: one account, one balance, one invoice
 * covering Claude, GPT and Kimi. It speaks the OpenAI /chat/completions
 * dialect, so it reuses the shared adapter and adds only a default endpoint,
 * attribution headers and its own rate table. Set OPENROUTER_API_KEY.
 *
 * The three ADMIN jobs now lead with it, so one account and one invoice cover
 * Claude, GPT and Kimi. The direct providers stay in each chain BELOW it: if
 * OpenRouter is down, rate-limits, or the credit balance runs dry, the router
 * falls through to a direct key exactly as it does today.
 *
 * SAFE TO DEPLOY BEFORE YOU SET THE KEY. With OPENROUTER_API_KEY unset the
 * provider reports itself unconfigured and the router skips straight to the
 * direct Anthropic candidate — today's behaviour, unchanged. Nothing switches
 * over until you add one variable.
 *
 * VISION IS DELIBERATELY NOT MOVED. See the vision_analysis route below.
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
  chain: readonly [RouteCandidate, ...RouteCandidate[]];
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
 * The OpenRouter platform fee, as a multiplier on list price.
 *
 * OpenRouter does NOT mark up tokens — it passes each provider's published
 * rate through unchanged and takes its cut when you buy credits: 5.5% on card
 * top-ups with a $0.80 minimum, about 5% on crypto. So a token that lists at
 * $3.00/MTok costs you $3.00 of credits that you paid $3.17 for.
 *
 * That fee is applied HERE rather than ignored, because the daily ceiling is
 * the only thing standing between a loop and a bill, and a ceiling built on
 * list price under-reports what leaves your account. The $0.80 per-purchase
 * minimum is not modelled: it is a function of how you top up, not of how many
 * tokens you burn. Top up in larger, less frequent amounts and it disappears
 * into the percentage; top up $5 at a time and it dominates.
 *
 * VERIFY — 5.5% is the card rate as published. Confirm against your own
 * statement once you have one, and adjust this single constant if it moves.
 */
export const OPENROUTER_FEE_MULTIPLIER = 1.055;

/** List cents/MTok times the platform fee, rounded up. Never optimistic. */
function withOpenRouterFee(listCentsPerMTok: number): number {
  return Math.ceil(listCentsPerMTok * OPENROUTER_FEE_MULTIPLIER);
}

/**
 * VERIFY — every number below is a list price from memory, not from an
 * invoice. Confirm each against the provider's current pricing page before you
 * trust the daily ceiling. Cost is reported in CENTS PER MILLION TOKENS.
 * Unknown model ids fall through to PROVIDER_DEFAULT_RATES, which are
 * deliberately pessimistic so an unpriced model over-reports rather than
 * under-reports spend.
 *
 * The `openrouter:` keys are the same models bought through OpenRouter. They carry the SAME list
 * price as the direct entry above them plus the platform fee, which is the
 * honest comparison: routing through OpenRouter costs a few percent more per
 * token and buys one account, one balance and one invoice.
 */
export const MODEL_RATES: Record<string, CostRate> = {
  // Anthropic — direct
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
  // OpenAI — direct
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
  // Moonshot / Kimi — direct
  'moonshot:moonshot-v1-32k': {
    inputCentsPerMTok: 240,
    outputCentsPerMTok: 240,
    cachedReadMultiplier: 0.1,
    cacheWriteMultiplier: 1,
  },

  // ---- via OpenRouter ----
  // Cache multipliers are 1 across the board: the compatible adapter sends no
  // cache_control and claims no caching, so anything else here would be a
  // number that looks meaningful and is not.
  'openrouter:anthropic/claude-sonnet-5': {
    inputCentsPerMTok: withOpenRouterFee(300),
    outputCentsPerMTok: withOpenRouterFee(1500),
    cachedReadMultiplier: 1,
    cacheWriteMultiplier: 1,
  },
  'openrouter:anthropic/claude-haiku-4.5': {
    inputCentsPerMTok: withOpenRouterFee(100),
    outputCentsPerMTok: withOpenRouterFee(500),
    cachedReadMultiplier: 1,
    cacheWriteMultiplier: 1,
  },
  'openrouter:openai/gpt-4o': {
    inputCentsPerMTok: withOpenRouterFee(250),
    outputCentsPerMTok: withOpenRouterFee(1000),
    // OpenAI's automatic caching IS reported through OpenRouter in
    // prompt_tokens_details.cached_tokens, and the adapter already subtracts
    // it — so this discount is real on this one vendor.
    cachedReadMultiplier: 0.5,
    cacheWriteMultiplier: 1,
  },
  'openrouter:openai/gpt-4o-mini': {
    inputCentsPerMTok: withOpenRouterFee(15),
    outputCentsPerMTok: withOpenRouterFee(60),
    cachedReadMultiplier: 0.5,
    cacheWriteMultiplier: 1,
  },
  'openrouter:moonshotai/kimi-k2': {
    inputCentsPerMTok: withOpenRouterFee(240),
    outputCentsPerMTok: withOpenRouterFee(240),
    cachedReadMultiplier: 1,
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
  /**
   * Pessimistic ON PURPOSE. OpenRouter fronts a catalogue of 300+ models, so a
   * slug that is not in the table above is far more likely here than anywhere
   * else — and an unpriced model must over-report spend, never under-report
   * it. The ceiling is the last line of defence.
   */
  openrouter: {
    inputCentsPerMTok: withOpenRouterFee(300),
    outputCentsPerMTok: withOpenRouterFee(1500),
    cachedReadMultiplier: 1,
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
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-5',
        modelEnv: 'AI_MODEL_SITE_COPY',
        maxOutputTokens: 3000,
        temperature: 0.7,
        // NO `cache` FLAG, and this costs real money — see the note below the
        // routes. The compatible adapter sends no cache_control, so a cached
        // prompt through OpenRouter is billed as a fresh one.
        jsonMode: true,
      },
      {
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        modelEnv: 'AI_MODEL_SITE_COPY_DIRECT',
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
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-5',
        modelEnv: 'AI_MODEL_RESTYLE',
        maxOutputTokens: 1500,
        temperature: 0.4,
        jsonMode: true,
      },
      {
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        modelEnv: 'AI_MODEL_RESTYLE_DIRECT',
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
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-5',
        modelEnv: 'AI_MODEL_QUOTE_PARAMS',
        maxOutputTokens: 2000,
        // Money math. The temperature that makes copy interesting makes
        // pricing advice creative, and creative is the wrong adjective here.
        temperature: 0,
        jsonMode: true,
      },
      {
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        modelEnv: 'AI_MODEL_QUOTE_PARAMS_DIRECT',
        maxOutputTokens: 2000,
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
   *
   * STILL ON A DIRECT ANTHROPIC KEY, on purpose, even though consolidating
   * billing is the whole point of this change. Three reasons, in order:
   *
   *  1. This is the only route a homeowner waits on. Adding a gateway hop to
   *     a 25-second budget is a latency change on the conversion path, and it
   *     should be measured before it is shipped, not shipped and then noticed.
   *  2. OpenRouter can silently route a slug to a different upstream host with
   *     its own throughput. For admin copy that is a feature. For the one call
   *     that decides whether a contractor's customer sees a price, it is an
   *     uncontrolled variable.
   *  3. Vision is likely most of your token spend, so it is also the one route
   *     where the 5.5% is worth measuring against rather than assuming.
   *
   * TO FLIP IT once you have measured: change `provider` to 'compatible' and
   * `model` to the OpenRouter slug, and add a second chain entry pointing back
   * at anthropic. Nothing else in the codebase changes.
   */
  vision_analysis: {
    label: 'Photo analysis',
    description: 'Classifies one photo. Runs on the public funnel, not from this panel.',
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
 * THE PROMPT-CACHING TRADE, stated plainly because it is the one place this
 * change costs you money rather than saving it.
 *
 * Anthropic prompt caching bills cached reads at roughly a tenth of the input
 * rate. site_copy, component_restyle and quote_params all send a large fixed
 * system prompt, so caching was doing real work — and the compatible adapter
 * declares supportsPromptCaching: false, so routing those jobs through
 * OpenRouter loses it. On a long system prompt the lost cache discount can
 * outweigh the 5.5% several times over.
 *
 * That is why the direct Anthropic candidate stays second in every chain
 * rather than being deleted: swapping the first two entries in any route
 * reverts that one job to direct-with-caching, and nothing else changes.
 * Watch the ai_jobs cost column for a week after switching and decide per
 * route with real numbers instead of an argument.
 */

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
  openrouter: {
    // A DEFAULT IS CORRECT HERE, unlike `compatible` below. OpenRouter is a
    // named vendor with one documented endpoint, so hardcoding it removes an
    // env var you could typo rather than removing a safeguard. Still
    // overridable for a proxy or a regional gateway.
    baseUrlEnv: 'OPENROUTER_BASE_URL',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
  },
  compatible: {
    // No default: an OpenAI-compatible adapter with a guessed URL is a way to
    // send your prompts somewhere you did not choose. This slot stays the
    // anonymous escape hatch — Together, Groq, a self-hosted vLLM — now that
    // OpenRouter has an entry of its own.
    baseUrlEnv: 'AI_COMPATIBLE_BASE_URL',
    defaultBaseUrl: null,
    apiKeyEnv: 'AI_COMPATIBLE_API_KEY',
  },
};

export function getRoute(job: JobId): RouteConfig {
  return AI_ROUTES[job];
}
