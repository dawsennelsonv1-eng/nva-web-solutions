import type { ZodType } from 'zod';

/**
 * lib/ai/types.ts — the vocabulary every adapter, the router and the admin UI
 * agree on.
 *
 * NO 'server-only' HERE ON PURPOSE. The admin panel is a client component and
 * needs these shapes; everything in this file is types plus two pure helpers,
 * so importing it from the browser ships nothing but the helpers.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: a caller must never be able to tell
 * which provider answered by the shape of what came back. Four vendors, one
 * result type, one error type, one token count. Anything provider-specific
 * dies inside the adapter.
 */

export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'moonshot'
  | 'openrouter'
  | 'compatible';

/**
 * ORDER IS THE ADMIN PANEL'S DISPLAY ORDER, nothing more — routing priority
 * lives in each route's `chain` in config.ts, never here.
 *
 * 'openrouter' is its own id rather than a use of 'compatible' because the two
 * mean different things operationally: 'compatible' is an unconfigured escape
 * hatch with no default URL, while OpenRouter is a known vendor with a known
 * endpoint, a known fee structure, its own rate table and its own attribution
 * headers. Folding them together would make the status strip say
 * "OpenAI-compatible: configured" when what is actually configured is a
 * specific account with a specific balance that can run out.
 */
export const PROVIDER_IDS: readonly ProviderId[] = [
  'anthropic',
  'openai',
  'moonshot',
  'openrouter',
  'compatible',
];

/** The job types this layer routes. Keys of AI_CONFIG.routes. */
export type JobId =
  | 'site_copy'
  | 'component_restyle'
  | 'quote_params'
  | 'vision_analysis';

/**
 * The three jobs an admin can start from the panel. vision_analysis is
 * deliberately NOT one of them: it is the homeowner's path, it consumes the
 * contractor's paid quota, and it has no business being triggerable from an
 * admin text box.
 */
export type AdminJobId = Exclude<JobId, 'vision_analysis'>;

export const ADMIN_JOB_IDS: readonly AdminJobId[] = [
  'site_copy',
  'component_restyle',
  'quote_params',
];

export function isAdminJobId(value: string): value is AdminJobId {
  return (ADMIN_JOB_IDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// token accounting
// ---------------------------------------------------------------------------

/**
 * Normalized across all four vendors.
 *
 * cachedInputTokens and cacheWriteTokens are SEPARATE from inputTokens because
 * every provider that supports caching prices them differently from fresh
 * input — folding them together would quietly misreport spend, and this layer
 * is the one that can spend money without anyone watching.
 *
 * `estimated` is true when the provider did not return usage and we counted
 * characters instead. It exists so the UI can say "approximately" rather than
 * printing a number that looks measured but is not.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  estimated: boolean;
}

export const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  estimated: false,
};

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    estimated: a.estimated || b.estimated,
  };
}

/** Rough token count used only when a provider returns no usage block. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// messages
// ---------------------------------------------------------------------------

export type ImageMediaType = 'image/jpeg' | 'image/webp' | 'image/png';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: ImageMediaType; base64: string };

export interface ChatMessage {
  role: 'user' | 'assistant';
  /** A bare string is sent as a bare string, part arrays as parts. */
  content: string | ContentPart[];
}

// ---------------------------------------------------------------------------
// requests and results
// ---------------------------------------------------------------------------

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  /** Hard per-request output ceiling. Required — there is no unbounded call. */
  maxOutputTokens: number;
  system?: string | undefined;
  temperature?: number | undefined;
  /** Ask the provider for JSON at the protocol level where it supports one. */
  jsonMode?: boolean | undefined;
  /** Mark the system prompt cacheable where the provider supports it. */
  cache?: boolean | undefined;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
}

export interface CompletionResult {
  text: string;
  usage: TokenUsage;
  provider: ProviderId;
  model: string;
  /** Vendor's own stop reason string, unnormalized, for logs only. */
  stopReason: string | null;
}

/**
 * Wording for the ONE repair retry. Defaulted by the base provider; passed
 * explicitly by lib/quote/vision.ts so its repair prompts stay byte-identical
 * to what Phase 3 shipped.
 */
export interface RepairOptions {
  enabled: boolean;
  invalidJsonMessage: string;
  schemaMessagePrefix: string;
  schemaMessageSuffix: string;
}

export interface StructuredRequest<T> extends CompletionRequest {
  schema: ZodType<T>;
  repair?: RepairOptions | undefined;
  /** When present the adapter streams and feeds deltas here as they arrive. */
  onDelta?: ((delta: string) => void) | undefined;
  /** Called once, before the repair retry, so the UI can say what happened. */
  onRepair?: ((reason: 'invalid_json' | 'schema', detail: string) => void) | undefined;
}

export interface StructuredResult<T> {
  data: T;
  usage: TokenUsage;
  provider: ProviderId;
  model: string;
  /** 1 when the first response validated, 2 when the repair retry saved it. */
  attempts: number;
}

// ---------------------------------------------------------------------------
// what the admin UI receives over SSE
// ---------------------------------------------------------------------------

export interface JobCostBreakdown {
  costCents: number;
  usage: TokenUsage;
  provider: ProviderId;
  model: string;
  estimated: boolean;
}

export type AiStreamEvent =
  | { type: 'start'; job: JobId; provider: ProviderId; model: string }
  | { type: 'delta'; text: string }
  | { type: 'fallback'; from: ProviderId; to: ProviderId; reason: string }
  | { type: 'repair'; reason: 'invalid_json' | 'schema'; detail: string }
  | {
      type: 'done';
      jobId: string | null;
      data: unknown;
      cost: JobCostBreakdown;
      attempts: number;
    }
  | { type: 'error'; code: string; message: string; action: string };
