import { EMPTY_USAGE, type ProviderId, type TokenUsage } from './types';

/**
 * lib/ai/errors.ts — ONE error type for four vendors.
 *
 * The router decides whether to fall back by reading `code`, never by reading
 * a vendor's message string. If a new provider is added and its failures are
 * not mapped here, the router will treat them as 'provider_error', which falls
 * back — the safe default.
 */

export type AiErrorCode =
  | 'not_configured'
  | 'auth'
  | 'rate_limited'
  | 'timeout'
  | 'overloaded'
  | 'invalid_request'
  | 'context_length'
  | 'content_filter'
  | 'provider_error'
  | 'invalid_json'
  | 'schema'
  | 'budget_exceeded'
  | 'no_provider'
  | 'aborted';

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly provider: ProviderId | null;
  readonly status: number | null;
  readonly retryable: boolean;
  /** Tokens already paid for when this failed. Never discarded. */
  readonly usage: TokenUsage;
  readonly detail: string | null;

  constructor(args: {
    code: AiErrorCode;
    message?: string;
    provider?: ProviderId | null;
    status?: number | null;
    usage?: TokenUsage;
    detail?: string | null;
  }) {
    super(args.message ?? args.code);
    this.name = 'AiError';
    this.code = args.code;
    this.provider = args.provider ?? null;
    this.status = args.status ?? null;
    this.retryable = RETRYABLE.has(args.code);
    this.usage = args.usage ?? EMPTY_USAGE;
    this.detail = args.detail ?? null;
  }

  /** A copy carrying accumulated usage. Errors are otherwise immutable. */
  withUsage(usage: TokenUsage): AiError {
    return new AiError({
      code: this.code,
      message: this.message,
      provider: this.provider,
      status: this.status,
      usage,
      detail: this.detail,
    });
  }
}

/**
 * Codes worth trying the next provider for. 'invalid_request' and
 * 'context_length' are NOT here: those are our bug, and asking a second vendor
 * to run our broken request just spends twice as much before failing.
 */
const RETRYABLE = new Set<AiErrorCode>([
  'not_configured',
  'auth',
  'rate_limited',
  'timeout',
  'overloaded',
  'provider_error',
]);

export function classifyStatus(status: number): AiErrorCode {
  if (status === 400 || status === 404 || status === 422) return 'invalid_request';
  if (status === 401 || status === 403) return 'auth';
  if (status === 413) return 'context_length';
  if (status === 429) return 'rate_limited';
  if (status === 529 || status === 503) return 'overloaded';
  return 'provider_error';
}

/** Anything thrown by fetch/JSON/abort becomes an AiError with a real code. */
export function toAiError(e: unknown, provider: ProviderId | null): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Error) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') {
      return new AiError({ code: 'timeout', message: 'request timed out', provider });
    }
    return new AiError({
      code: 'provider_error',
      message: e.message,
      provider,
      detail: e.name,
    });
  }
  return new AiError({ code: 'provider_error', message: 'unknown provider failure', provider });
}

/**
 * What the admin sees. Errors say what happened AND what to do — a bare code
 * in a panel is a support ticket waiting to be filed.
 */
export function explain(err: AiError): { message: string; action: string } {
  switch (err.code) {
    case 'not_configured':
      return {
        message: 'No API key is set for any provider configured for this job.',
        action: 'Add the provider key in Vercel project settings, then redeploy.',
      };
    case 'auth':
      return {
        message: `The ${err.provider ?? 'provider'} key was rejected.`,
        action: 'Check the key value and that it has not been revoked or rotated.',
      };
    case 'rate_limited':
      return {
        message: 'The provider is rate limiting this account.',
        action: 'Wait a minute and run it again, or add a second provider to this job.',
      };
    case 'timeout':
      return {
        message: 'No provider answered before the timeout.',
        action: 'Run it again. If it repeats, shorten the intent or lower max output tokens.',
      };
    case 'overloaded':
      return {
        message: 'Every provider for this job reported it was overloaded.',
        action: 'Run it again in a few minutes.',
      };
    case 'invalid_request':
      return {
        message: 'The provider rejected the request as malformed.',
        action: 'This is a bug in the prompt or route config, not a transient failure. Check the model id in lib/ai/config.ts.',
      };
    case 'context_length':
      return {
        message: 'The request was longer than the model can read.',
        action: 'Shorten the intent, or route this job to a longer-context model.',
      };
    case 'content_filter':
      return {
        message: 'The provider refused to answer this prompt.',
        action: 'Reword the intent and run it again.',
      };
    case 'invalid_json':
      return {
        message: 'The model did not return JSON, even after one repair attempt.',
        action: 'Run it again, or route this job to a stronger model in lib/ai/config.ts.',
      };
    case 'schema':
      return {
        message: 'The model returned JSON in the wrong shape, even after one repair attempt.',
        action: 'Run it again. If it keeps failing on the same field, the prompt and the schema disagree.',
      };
    case 'budget_exceeded':
      return {
        message: err.message,
        action: 'Raise AI_DAILY_SPEND_CEILING_CENTS in Vercel, or wait for the ceiling to reset at 00:00 UTC.',
      };
    case 'aborted':
      return { message: 'The run was cancelled.', action: 'Run it again when ready.' };
    case 'no_provider':
      return {
        message: 'Every provider configured for this job failed.',
        action: 'Open the run log below for each provider’s reason.',
      };
    default:
      return {
        message: err.message || 'The provider failed.',
        action: 'Run it again. If it repeats, check the provider status page.',
      };
  }
}
