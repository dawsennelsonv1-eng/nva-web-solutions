import 'server-only';
import { createHash } from 'node:crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * lib/quote/guards.ts — COST GUARDS for the paid vision path.
 *
 * Four independent layers, because each one fails differently:
 *   1. PAYLOAD SIZE   — rejected before a byte reaches Anthropic.
 *   2. PER-IP RATE    — DB-backed fixed window (0005_rate_limits.sql).
 *   3. DAILY CEILING  — hard spend stop from ai_jobs, server-enforced.
 *   4. PER-SESSION    — enforced in check.ts / usage.ts, not here.
 *
 * Layer 3 is the one that actually protects the bank account: rate limits are
 * per-subject and a distributed caller defeats them, but the daily ceiling is
 * a single global number that nothing can route around.
 *
 * FILE_TREE.md addition: lib/quote/guards.ts [3]
 */

/**
 * Hard ceiling on the DECODED image, matched to the floor-photos storage
 * bucket limit set in 0004_storage.sql. The Phase 4 client pipeline targets
 * 400 KB; this 512 KB server ceiling leaves headroom for the pipeline while
 * still refusing anything a phone camera would produce unprocessed. This is
 * an infrastructure constant, not a price — it does not belong in a config
 * table, and it is deliberately identical in both places so an image that
 * clears the API can always be stored.
 */
export const MAX_IMAGE_BYTES = 512_000;

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/webp', 'image/png'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export type GuardVerdict =
  | { ok: true }
  | { ok: false; code: GuardFailureCode; message: string; retryAfterSeconds?: number };

export type GuardFailureCode =
  | 'image_too_large'
  | 'image_type_unsupported'
  | 'image_malformed'
  | 'rate_limited'
  | 'daily_ceiling'
  | 'guard_unavailable';

// ---------------------------------------------------------------------------
// 1. payload validation
// ---------------------------------------------------------------------------

/** Exact decoded length of a base64 payload without allocating the buffer. */
export function base64DecodedBytes(b64: string): number {
  const clean = b64.replace(/\s/g, '');
  if (clean.length === 0) return 0;
  if (clean.length % 4 !== 0) return -1; // malformed
  let padding = 0;
  if (clean.endsWith('==')) padding = 2;
  else if (clean.endsWith('=')) padding = 1;
  return (clean.length / 4) * 3 - padding;
}

/**
 * Phase 4 promises the client already compressed and orientation-corrected
 * the image. We validate it anyway: "the client did it" is an assumption, and
 * an unvalidated assumption on a paid endpoint is an invoice waiting to
 * happen. A direct POST to this action does not go through Phase 4 at all.
 */
export function validateImagePayload(
  base64: string,
  mediaType: string
): GuardVerdict {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(mediaType)) {
    return {
      ok: false,
      code: 'image_type_unsupported',
      message: 'That image format is not supported. Send a JPEG, WebP or PNG.',
    };
  }
  const bytes = base64DecodedBytes(base64);
  if (bytes < 0) {
    return { ok: false, code: 'image_malformed', message: 'That image could not be read.' };
  }
  if (bytes === 0) {
    return { ok: false, code: 'image_malformed', message: 'That image was empty.' };
  }
  if (bytes > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      code: 'image_too_large',
      message: 'That photo is too large to analyse. Try again with a smaller photo.',
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 2. per-IP rate limit
// ---------------------------------------------------------------------------

/**
 * A raw IP address is never written to the database. We store a salted
 * SHA-256, which is enough to count and impossible to reverse into a visitor.
 * The salt is server-only; RATE_LIMIT_SALT is preferred, and the service role
 * key is an acceptable fallback because it is already the most protected
 * secret in the deployment and never leaves the server.
 */
export function hashSubject(value: string): string {
  const salt =
    process.env.RATE_LIMIT_SALT ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    'nva-dev-salt-not-for-production';
  return createHash('sha256').update(salt + ':' + value).digest('hex');
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function checkIpRateLimit(
  ip: string | null,
  scope = 'vision_analysis'
): Promise<GuardVerdict> {
  // No resolvable address (some proxies, some previews): fall through rather
  // than block. The daily ceiling still bounds the damage.
  if (!ip) return { ok: true };

  const windowSeconds = envInt('RATE_LIMIT_WINDOW_SECONDS', 3600);
  const max = envInt('RATE_LIMIT_MAX_ANALYSES_PER_IP', 12);

  try {
    const db = getSupabaseAdminClient();
    const { data, error } = await db.rpc('check_rate_limit', {
      p_bucket_key: hashSubject(ip),
      p_scope: scope,
      p_window_seconds: windowSeconds,
      p_max: max,
    });
    if (error) throw error;
    const verdict = data as unknown as {
      allowed: boolean;
      retry_after_seconds: number;
    } | null;
    if (verdict && verdict.allowed === false) {
      return {
        ok: false,
        code: 'rate_limited',
        message: 'Too many photo analyses from this connection. Try again shortly.',
        retryAfterSeconds: verdict.retry_after_seconds,
      };
    }
    return { ok: true };
  } catch {
    // The limiter being down must not take the product down. The daily
    // ceiling below is the guard that cannot be bypassed.
    return { ok: true };
  }
}

// ---------------------------------------------------------------------------
// 3. daily spend ceiling
// ---------------------------------------------------------------------------

/**
 * Sums today's ai_jobs.cost_cents (UTC day) against
 * AI_DAILY_SPEND_CEILING_CENTS. Unset means unlimited, which is correct for
 * local development and wrong for production — the First Push Checklist says
 * so explicitly.
 *
 * Checked BEFORE the call, so the ceiling is a stop rather than a report.
 * A single call can overshoot the ceiling by at most one call's cost.
 */
export async function checkDailySpendCeiling(): Promise<GuardVerdict> {
  const ceiling = process.env.AI_DAILY_SPEND_CEILING_CENTS;
  if (!ceiling) return { ok: true };
  const ceilingCents = Number.parseInt(ceiling, 10);
  if (!Number.isFinite(ceilingCents) || ceilingCents <= 0) return { ok: true };

  try {
    const db = getSupabaseAdminClient();
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    const { data, error } = await db
      .from('ai_jobs')
      .select('cost_cents')
      .gte('created_at', dayStart.toISOString());
    if (error) throw error;

    const spent = (data ?? []).reduce(
      (sum, row) => sum + (row.cost_cents ?? 0),
      0
    );
    if (spent >= ceilingCents) {
      return {
        ok: false,
        code: 'daily_ceiling',
        message: 'Instant analysis is briefly unavailable.',
      };
    }
    return { ok: true };
  } catch {
    // If we cannot read the ledger we cannot prove we are under the ceiling.
    // This is the one guard that fails CLOSED: an unreadable spend log is
    // exactly the situation in which an unbounded spend does the most damage.
    return {
      ok: false,
      code: 'guard_unavailable',
      message: 'Instant analysis is briefly unavailable.',
    };
  }
}

/** Best-effort client address from the standard proxy headers. */
export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0];
    if (first) return first.trim();
  }
  return headers.get('x-real-ip') ?? null;
}
