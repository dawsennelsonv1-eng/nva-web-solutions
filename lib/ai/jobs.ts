import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { ProviderId, TokenUsage } from './types';

/**
 * lib/ai/jobs.ts — the ledger. Every provider call, successful or not, lands
 * in ai_jobs with what it cost.
 *
 * NOTHING IN THIS FILE THROWS. A logging failure must never fail the request
 * it was logging — that rule already governs Phase 3's vision path and it
 * governs the admin path too. The consequence is honest and worth stating: if
 * the database is down, spend goes unrecorded and the daily ceiling
 * under-counts. lib/ai/budget.ts handles that by refusing rather than
 * guessing.
 *
 * VERIFY — this module writes columns added by supabase/migrations/0010_ai_suite.sql.
 * Run that migration BEFORE deploying, or every insert here fails silently
 * (the job still runs; only the ledger row is lost).
 */

interface QueryResult<T> {
  data: T | null;
  error: { message?: string } | null;
  count?: number | null;
}

interface Filterable<T> extends PromiseLike<QueryResult<T>> {
  eq(column: string, value: string): Filterable<T>;
  gte(column: string, value: string): Filterable<T>;
  is(column: string, value: null): Filterable<T>;
  single(): PromiseLike<QueryResult<T>>;
  maybeSingle(): PromiseLike<QueryResult<T>>;
}

interface InsertBuilder extends PromiseLike<QueryResult<null>> {
  select(columns: string): Filterable<{ id: string }>;
}

interface Table {
  insert(row: Record<string, unknown>): InsertBuilder;
  update(row: Record<string, unknown>): Filterable<null>;
  select(
    columns: string,
    options?: { count?: 'exact'; head?: boolean }
  ): Filterable<Record<string, unknown>>;
}

interface AiDb {
  from(table: string): Table;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<QueryResult<number>>;
}

/**
 * One cast, in one place, documented. The generated Supabase types cannot know
 * about columns added by a migration in this same ZIP, and a build failure on
 * a column that exists in the database is a worse outcome than a narrow
 * structural interface maintained by hand.
 */
export function getAiDb(): AiDb {
  return getSupabaseAdminClient() as unknown as AiDb;
}

export type AiJobStatus = 'succeeded' | 'failed' | 'invalid_output';

export interface AiJobRecord {
  /** Cost attribution. Null for admin jobs and for /demo. */
  prototypeId: string | null;
  jobType: string;
  provider: ProviderId;
  model: string;
  usage: TokenUsage;
  costCents: number;
  status: AiJobStatus;
  error?: string | null;
  promptVersion?: string | null;
  attempts?: number;
  durationMs?: number | null;
  /** Admin identity for admin-initiated jobs. Null for the public funnel. */
  createdBy?: string | null;
  /** The validated input. Never the raw request body. */
  request?: unknown;
  /** The validated output, so Apply works from stored data, not a re-run. */
  output?: unknown;
  /** Providers tried and skipped before this one answered. */
  fellBackFrom?: ProviderId[];
  /** True when the provider gave no usage block and tokens were estimated. */
  estimated?: boolean;
}

/**
 * Returns the row id when it can, null when it cannot. Callers treat null as
 * "the work happened, the receipt did not" — never as a failure of the work.
 */
export async function recordAiJob(rec: AiJobRecord): Promise<string | null> {
  try {
    const db = getAiDb();
    const { data, error } = await db
      .from('ai_jobs')
      .insert({
        prototype_id: rec.prototypeId,
        job_type: rec.jobType,
        provider: rec.provider,
        model: rec.model,
        input_tokens: rec.usage.inputTokens,
        output_tokens: rec.usage.outputTokens,
        cached_input_tokens: rec.usage.cachedInputTokens,
        cache_write_tokens: rec.usage.cacheWriteTokens,
        cost_cents: rec.costCents,
        cost_estimated: rec.estimated ?? rec.usage.estimated,
        status: rec.status,
        error: rec.error ?? null,
        prompt_version: rec.promptVersion ?? null,
        attempts: rec.attempts ?? 1,
        duration_ms: rec.durationMs ?? null,
        created_by: rec.createdBy ?? null,
        request: rec.request ?? null,
        output: rec.output ?? null,
        fell_back_from: rec.fellBackFrom && rec.fellBackFrom.length > 0 ? rec.fellBackFrom : null,
      })
      .select('id')
      .single();
    if (error || !data) return null;
    return data.id;
  } catch {
    return null;
  }
}

/**
 * The Phase 3 shape: exactly the nine columns vision.ts has always written,
 * and nothing else. Kept as its own function so the vision ledger rows after
 * this phase are indistinguishable from the ones before it.
 */
/**
 * DEPRECATED AS OF PHASE 8. NOTHING CALLS THIS.
 *
 * lib/quote/vision.ts was its only caller and now relies on the router's own
 * ledger row, which is strictly richer — it carries fellBackFrom, the full
 * attempt log, the duration and the parsed output.
 *
 * KEPT, NOT DELETED, because it is exported and a vertical outside the files
 * read during this work could still import it. Deleting an export on the
 * strength of an incomplete grep is how a build breaks on deploy rather than
 * in a typechecker.
 *
 * VERIFY, then delete:
 *   grep -rn "recordVisionJob" --include=*.ts --include=*.tsx .
 * If this file is the only hit, remove the function.
 *
 * DO NOT CALL IT ALONGSIDE A ROUTE WITH `record: true`. Two rows for one call
 * double-counts cost_cents, and ai_spend_today_cents feeds the daily ceiling —
 * which means the budget trips at half the real spend and the visualiser
 * starts refusing work for a reason that is not true.
 */
export async function recordVisionJob(args: {
  prototypeId: string | null;
  model: string;
  status: AiJobStatus;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  error?: string;
  /**
   * WHICH VENDOR ACTUALLY RAN IT.
   *
   * This column was hardcoded to 'anthropic' from Phase 3, when the vision
   * route had exactly one candidate and that candidate was direct Anthropic.
   * The route now leads with OpenRouter, so every row written since then has
   * named the wrong provider — which makes the ledger actively misleading
   * exactly when somebody is using it to work out why measurement stopped.
   *
   * Optional, defaulting to the old value, so no existing caller changes
   * behaviour by being left alone.
   */
  provider?: ProviderId;
}): Promise<void> {
  try {
    const db = getAiDb();
    await db.from('ai_jobs').insert({
      prototype_id: args.prototypeId,
      job_type: 'vision_analysis',
      provider: args.provider ?? 'anthropic',
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

export interface StoredAiJob {
  id: string;
  jobType: string;
  provider: string;
  model: string;
  status: string;
  costCents: number;
  output: unknown;
  appliedAt: string | null;
  discardedAt: string | null;
  createdBy: string | null;
}

export async function getAiJob(id: string): Promise<StoredAiJob | null> {
  try {
    const db = getAiDb();
    const { data, error } = await db
      .from('ai_jobs')
      .select(
        'id, job_type, provider, model, status, cost_cents, output, applied_at, discarded_at, created_by'
      )
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: String(data.id),
      jobType: String(data.job_type ?? ''),
      provider: String(data.provider ?? ''),
      model: String(data.model ?? ''),
      status: String(data.status ?? ''),
      costCents: Number(data.cost_cents ?? 0),
      output: data.output ?? null,
      appliedAt: data.applied_at ? String(data.applied_at) : null,
      discardedAt: data.discarded_at ? String(data.discarded_at) : null,
      createdBy: data.created_by ? String(data.created_by) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Marks a proposal accepted. Returns false when the row is missing or already
 * resolved — the panel reads that as "someone else already decided this",
 * which is the honest reading and cheaper than a lock.
 */
export async function markJobApplied(
  id: string,
  by: string,
  note: string | null
): Promise<boolean> {
  try {
    const db = getAiDb();
    const { error } = await db
      .from('ai_jobs')
      .update({ applied_at: new Date().toISOString(), applied_by: by, apply_note: note })
      .eq('id', id)
      .is('applied_at', null);
    return !error;
  } catch {
    return false;
  }
}

export async function markJobDiscarded(id: string, by: string): Promise<boolean> {
  try {
    const db = getAiDb();
    const { error } = await db
      .from('ai_jobs')
      .update({ discarded_at: new Date().toISOString(), applied_by: by })
      .eq('id', id)
      .is('discarded_at', null);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Rows written since `sinceIso`, optionally for one admin. Used by the rate
 * limiter. Returns null when the count cannot be read, which the limiter
 * treats as a refusal rather than a green light.
 */
export async function countJobsSince(
  sinceIso: string,
  createdBy?: string
): Promise<number | null> {
  try {
    const db = getAiDb();
    let q = db
      .from('ai_jobs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sinceIso);
    if (createdBy) q = q.eq('created_by', createdBy);
    const { error, count } = await q;
    if (error) return null;
    return typeof count === 'number' ? count : 0;
  } catch {
    return null;
  }
}

/** Total cents recorded since 00:00 UTC today. Null when unreadable. */
export async function spendTodayCents(): Promise<number | null> {
  try {
    const db = getAiDb();
    const { data, error } = await db.rpc('ai_spend_today_cents');
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}
