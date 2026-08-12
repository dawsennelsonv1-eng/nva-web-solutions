import 'server-only';
import type { ZodType } from 'zod';
import { checkBudget } from './budget';
import { getRoute, HARD_MAX_OUTPUT_TOKENS, type RouteCandidate } from './config';
import { AiError, toAiError } from './errors';
import { recordAiJob } from './jobs';
import { computeCostCents, estimateCostCents, rateFor } from './pricing';
import { getProvider } from './providers';
import {
  addUsage,
  EMPTY_USAGE,
  type ChatMessage,
  type JobId,
  type ProviderId,
  type RepairOptions,
  type TokenUsage,
} from './types';

/**
 * lib/ai/router.ts — job in, validated object out, or a clean failure.
 *
 * NEVER THROWS. Every path returns a result object. The public funnel calls
 * this behind lib/quote/vision.ts, where an exception would take out a lead
 * capture, and lead capture never stops.
 *
 * ORDER OF OPERATIONS, and the order is the design:
 *   1. resolve the provider chain from config
 *   2. check the daily ceiling BEFORE any network call
 *   3. walk the chain, first configured provider that answers wins
 *   4. record what it cost, whatever the outcome
 *
 * Step 2 before step 3 is what makes the ceiling a ceiling. A check that ran
 * after the call would be a report.
 */

export interface RunJobOptions<T> {
  job: JobId;
  messages: ChatMessage[];
  schema: ZodType<T>;
  system?: string | undefined;
  repair?: RepairOptions | undefined;
  signal?: AbortSignal | undefined;
  onDelta?: ((delta: string) => void) | undefined;
  onRepair?: ((reason: 'invalid_json' | 'schema', detail: string) => void) | undefined;
  onFallback?: ((from: ProviderId, to: ProviderId, reason: string) => void) | undefined;
  /** Written to ai_jobs.prompt_version. */
  promptVersion?: string | undefined;
  createdBy?: string | null | undefined;
  prototypeId?: string | null | undefined;
  /** Validated input, stored on the ledger row so Apply never re-runs a job. */
  request?: unknown;
  /** Override the route's max output tokens. Still clamped to the hard cap. */
  maxOutputTokens?: number | undefined;
}

export interface AttemptLogEntry {
  provider: ProviderId;
  model: string;
  outcome: 'skipped' | 'failed' | 'succeeded';
  code: string | null;
  detail: string | null;
}

export interface RunJobSuccess<T> {
  ok: true;
  data: T;
  provider: ProviderId;
  model: string;
  usage: TokenUsage;
  costCents: number;
  /** Model calls made, including the repair retry. */
  attempts: number;
  fellBackFrom: ProviderId[];
  jobId: string | null;
  durationMs: number;
  log: AttemptLogEntry[];
}

export interface RunJobFailure {
  ok: false;
  error: AiError;
  usage: TokenUsage;
  costCents: number;
  fellBackFrom: ProviderId[];
  jobId: string | null;
  durationMs: number;
  log: AttemptLogEntry[];
}

export type RunJobResult<T> = RunJobSuccess<T> | RunJobFailure;

function envInt(name: string | undefined): number | null {
  if (!name) return null;
  const raw = process.env[name];
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The slug this candidate would actually send, after env overrides.
 *
 * EXPORTED so app/api/health/models can check the SAME string the router
 * would use. A health check that re-derives the slug from `c.model` and
 * ignores `c.modelEnv` would report the committed default as healthy while
 * production ran an override that had gone stale — a green check on a broken
 * deployment, which is worse than no check at all.
 */
export function resolveModel(c: RouteCandidate): string {
  const override = c.modelEnv ? process.env[c.modelEnv] : undefined;
  return override && override.trim().length > 0 ? override.trim() : c.model;
}

/** No route, and no env var, may exceed the hard cap. */
function resolveMaxTokens(c: RouteCandidate, override?: number): number {
  const chosen = override ?? envInt(c.maxOutputTokensEnv) ?? c.maxOutputTokens;
  return Math.min(chosen, HARD_MAX_OUTPUT_TOKENS);
}

/**
 * The model this job would use right now. Exported because a caller that
 * records its own ledger row (lib/quote/vision.ts) must name the same model
 * the router would pick — two sources of truth for one string is how a ledger
 * starts disagreeing with reality.
 */
export function resolveJobModel(job: JobId): string {
  return resolveModel(getRoute(job).chain[0]);
}

/** True when at least one provider in this job's chain has a key. */
export function jobProviderConfigured(job: JobId): boolean {
  return getRoute(job).chain.some((c) => getProvider(c.provider).isConfigured());
}

/**
 * =============================================================================
 * WHY `invalid_request` NOW ADVANCES THE CHAIN. READ BEFORE REVERTING.
 * =============================================================================
 *
 * `invalid_request` is not in RETRYABLE (lib/ai/errors.ts) and the reasoning
 * there is sound FOR ONE MODEL: a malformed request is our bug, and handing
 * the same broken payload to a second vendor spends twice as much before
 * failing the same way.
 *
 * It was wrong across a CHAIN, and it cost this product its headline feature.
 *
 * classifyStatus maps 400 AND 404 to 'invalid_request'. An OpenRouter slug
 * that has been retired answers 404. So one stale model id anywhere in a chain
 * did not degrade to the next candidate — it BROKE OUT of the loop and took
 * every candidate behind it down with it. `vision_analysis` had
 * `google/gemini-3-pro` in position two, a slug that does not exist in
 * OpenRouter's catalogue, so positions three and four were unreachable. The
 * measurement was dead and nothing said so.
 *
 * The distinction that fixes it: a chain's candidates carry DIFFERENT model
 * ids. "This request is malformed for this model" says nothing about the next
 * model, so we advance when the next candidate is a different model, and stop
 * when it is the same one — which preserves the original reasoning exactly
 * where it applies.
 *
 * `context_length` deliberately still breaks. It is a property of the payload
 * against a class of model, and the honest fix is a shorter prompt, not a
 * lap of the chain.
 */
function shouldTryNext(
  err: AiError,
  fallbackOnValidationFailure: boolean,
  nextIsDifferentModel: boolean
): boolean {
  if (err.code === 'aborted' || err.code === 'budget_exceeded') return false;
  if (err.code === 'invalid_json' || err.code === 'schema') return fallbackOnValidationFailure;
  if (err.code === 'invalid_request') return nextIsDifferentModel;
  return err.retryable;
}

export async function runJob<T>(opts: RunJobOptions<T>): Promise<RunJobResult<T>> {
  const startedAt = Date.now();
  const route = getRoute(opts.job);
  const log: AttemptLogEntry[] = [];
  const fellBackFrom: ProviderId[] = [];
  let usage: TokenUsage = { ...EMPTY_USAGE };
  let costCents = 0;

  const fail = async (error: AiError): Promise<RunJobFailure> => {
    const durationMs = Date.now() - startedAt;
    let jobId: string | null = null;
    if (route.record) {
      const last = log[log.length - 1];
      jobId = await recordAiJob({
        prototypeId: opts.prototypeId ?? null,
        jobType: opts.job,
        provider: error.provider ?? route.chain[0].provider,
        model: last?.model ?? resolveModel(route.chain[0]),
        usage,
        costCents,
        status: error.code === 'invalid_json' || error.code === 'schema' ? 'invalid_output' : 'failed',
        error: error.code,
        promptVersion: opts.promptVersion ?? null,
        durationMs,
        createdBy: opts.createdBy ?? null,
        request: opts.request ?? null,
        fellBackFrom,
      });
    }
    return { ok: false, error, usage, costCents, fellBackFrom, jobId, durationMs, log };
  };

  // --- the ceiling, before anything leaves the building ---------------------
  if (route.honorDailyCeiling) {
    const first = route.chain[0];
    const promptChars =
      (opts.system?.length ?? 0) + JSON.stringify(opts.messages).length;
    const estimate = estimateCostCents({
      promptChars,
      maxOutputTokens: resolveMaxTokens(first, opts.maxOutputTokens),
      rate: rateFor(first.provider, resolveModel(first), route.costRateOverride),
      repairEnabled: route.repair,
    });
    const decision = await checkBudget(estimate);
    if (!decision.allowed) {
      return fail(
        new AiError({ code: 'budget_exceeded', message: decision.message, provider: null })
      );
    }
  }

  // --- walk the chain -------------------------------------------------------
  /**
   * TWO SLOTS, NOT ONE, AND THIS IS THE OTHER HALF OF THE SILENT-FAILURE BUG.
   *
   * There was a single `lastError`, overwritten by every candidate including
   * the ones that were SKIPPED for having no key. `vision_analysis` ends its
   * chain with a direct-Anthropic entry, and ANTHROPIC_API_KEY is not set on
   * this deployment. So whatever really went wrong at candidates one to three
   * — a 404 on a retired slug, a timeout, a schema rejection — was overwritten
   * on the final lap by 'not_configured'.
   *
   * That code then took a second toll downstream: lib/quote/vision.ts skips
   * writing an ai_jobs row when the reason is 'not_configured', on the correct
   * reasoning that nothing was called so nothing was billed. The result was a
   * failed measurement with NO LEDGER ROW AND NO DIAGNOSIS ANYWHERE — the exact
   * definition of failing silently.
   *
   * `lastSubstantive` holds the last error from a candidate that actually ran.
   * It wins. `lastSkip` is only reported when nothing ran at all, which is the
   * one case where 'not_configured' is genuinely the whole story.
   */
  let lastSubstantive: AiError | null = null;
  let lastSkip: AiError | null = null;

  for (let i = 0; i < route.chain.length; i += 1) {
    const candidate = route.chain[i];
    if (!candidate) continue;
    const provider = getProvider(candidate.provider);
    const model = resolveModel(candidate);

    if (!provider.isConfigured()) {
      log.push({
        provider: candidate.provider,
        model,
        outcome: 'skipped',
        code: 'not_configured',
        detail: `${provider.configHint()} is not set`,
      });
      lastSkip = new AiError({
        code: 'not_configured',
        message: `${provider.label} has no key (${provider.configHint()})`,
        provider: candidate.provider,
      });
      continue;
    }

    try {
      const result = await provider.completeStructured<T>({
        model,
        system: opts.system,
        messages: opts.messages,
        maxOutputTokens: resolveMaxTokens(candidate, opts.maxOutputTokens),
        temperature: candidate.temperature,
        jsonMode: candidate.jsonMode,
        cache: candidate.cache && provider.supportsPromptCaching,
        timeoutMs: candidate.timeoutMs,
        signal: opts.signal,
        schema: opts.schema,
        repair: opts.repair ?? (route.repair ? undefined : { ...NO_REPAIR }),
        onDelta: opts.onDelta,
        onRepair: opts.onRepair,
      });

      usage = addUsage(usage, result.usage);
      costCents += computeCostCents(
        result.usage,
        rateFor(candidate.provider, result.model, route.costRateOverride)
      );
      log.push({
        provider: candidate.provider,
        model: result.model,
        outcome: 'succeeded',
        code: null,
        detail: result.attempts > 1 ? 'needed one repair retry' : null,
      });

      const durationMs = Date.now() - startedAt;
      let jobId: string | null = null;
      if (route.record) {
        jobId = await recordAiJob({
          prototypeId: opts.prototypeId ?? null,
          jobType: opts.job,
          provider: candidate.provider,
          model: result.model,
          usage: result.usage,
          costCents,
          status: 'succeeded',
          promptVersion: opts.promptVersion ?? null,
          attempts: result.attempts,
          durationMs,
          createdBy: opts.createdBy ?? null,
          request: opts.request ?? null,
          output: result.data,
          fellBackFrom,
        });
      }

      return {
        ok: true,
        data: result.data,
        provider: candidate.provider,
        model: result.model,
        usage: result.usage,
        costCents,
        attempts: result.attempts,
        fellBackFrom,
        jobId,
        durationMs,
        log,
      };
    } catch (e) {
      const err = toAiError(e, candidate.provider);
      // Tokens spent before the failure are still tokens spent.
      usage = addUsage(usage, err.usage);
      costCents += computeCostCents(
        err.usage,
        rateFor(candidate.provider, model, route.costRateOverride)
      );
      lastSubstantive = err;
      log.push({
        provider: candidate.provider,
        model,
        outcome: 'failed',
        code: err.code,
        // The vendor's own sentence, not just our code. A 404 body naming the
        // slug is the difference between "provider error" and "you deleted
        // that model six weeks ago".
        detail: err.detail ?? err.message,
      });

      const next = route.chain[i + 1];
      const nextIsDifferentModel = next ? resolveModel(next) !== model : false;
      if (!shouldTryNext(err, route.fallbackOnValidationFailure, nextIsDifferentModel)) break;

      if (next) {
        fellBackFrom.push(candidate.provider);
        opts.onFallback?.(candidate.provider, next.provider, err.code);
      }
    }
  }

  // A candidate that RAN and failed always outranks one that was skipped for
  // want of a key. See the comment above the declarations.
  return fail(
    lastSubstantive ??
      lastSkip ??
      new AiError({ code: 'no_provider', message: 'no provider was available for this job' })
  );
}

/** Passed when a route switches the repair retry off. */
const NO_REPAIR: RepairOptions = {
  enabled: false,
  invalidJsonMessage: '',
  schemaMessagePrefix: '',
  schemaMessageSuffix: '',
};
