import 'server-only';
import { createHash } from 'node:crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { dailyCeilingCents } from '@/lib/ai/budget';
import { sendBillingEmail } from '@/lib/notify/email';

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
 * PHASE 12A CHANGED FOUR THINGS. Each was a way for layer 3 to be absent
 * while looking present.
 *
 *   (a) UNSET NO LONGER MEANS UNLIMITED. This file used to return ok on a
 *       missing AI_DAILY_SPEND_CEILING_CENTS. Every other spend path in the
 *       codebase already fell back to DEFAULT_DAILY_CEILING_CENTS via
 *       lib/ai/budget.ts; this one didn't, so the single path an anonymous
 *       visitor can reach was the single path with no default. It now reads
 *       the ceiling through the same dailyCeilingCents() everything else uses.
 *
 *   (b) THE SUM MOVED INTO POSTGRES. The old query fetched every row and
 *       summed in JS, which PostgREST truncates at 1000 rows. See
 *       0011_spend_guard.sql for the full account of why that was worse than
 *       having no ceiling at all.
 *
 *   (c) THE CLIENT NO LONGER CHOOSES ITS OWN RATE-LIMIT BUCKET. See
 *       clientIpFromHeaders.
 *
 *   (d) A WARNING NOW ARRIVES BEFORE THE STOP, not after. A ceiling that only
 *       speaks when it has already been hit tells you about an outage you are
 *       already having.
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
  // Alphabet check. Length arithmetic alone accepts 683 KB of arbitrary text,
  // which passes the size gate and then buys a provider round trip that was
  // always going to fail. Rejecting it here costs one linear scan.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return -1;
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
 *
 * PHASE 12A: the service-role key is no longer accepted as the salt. It was
 * defended as "already the most protected secret in the deployment," which is
 * true and beside the point — rotating that key silently reset every rate
 * limit bucket in the system, so the one operation you perform after a
 * suspected key leak also removed the limiter standing between an attacker
 * and the API. A dedicated salt costs one env var.
 *
 * The dev fallback is deliberately loud rather than silent, because a
 * production deployment running on it produces buckets an attacker who reads
 * this file can compute.
 */
export function hashSubject(value: string): string {
  const configured = process.env.RATE_LIMIT_SALT;
  if (!configured && process.env.NODE_ENV === 'production') {
    console.error(
      '[guards] RATE_LIMIT_SALT is not set. Rate-limit buckets are using a public constant. Set it in Vercel.'
    );
  }
  const salt = configured ?? 'nva-dev-salt-not-for-production';
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
    // ceiling below is the guard that cannot be bypassed — and as of Phase
    // 12A it is genuinely always present, which is what makes failing open
    // here defensible rather than merely convenient.
    return { ok: true };
  }
}

/**
 * A GENERIC sibling to checkIpRateLimit (Phase 5 addition).
 *
 * checkIpRateLimit reads its window/max from RATE_LIMIT_WINDOW_SECONDS /
 * RATE_LIMIT_MAX_ANALYSES_PER_IP — names that are correct for the vision
 * path but would be misleading for anything else that calls it. This
 * function takes window/max as explicit arguments and calls the SAME
 * execution-verified check_rate_limit RPC (0005_rate_limits.sql) under a
 * caller-chosen scope, so a second kind of abuse (e.g. lead-form spam) gets
 * its own independent budget rather than sharing — and draining — the
 * vision quota's counter.
 */
export async function checkScopedRateLimit(
  ip: string | null,
  scope: string,
  windowSeconds: number,
  max: number
): Promise<GuardVerdict> {
  if (!ip) return { ok: true };
  try {
    const db = getSupabaseAdminClient();
    const { data, error } = await db.rpc('check_rate_limit', {
      p_bucket_key: hashSubject(ip),
      p_scope: scope,
      p_window_seconds: windowSeconds,
      p_max: max,
    });
    if (error) throw error;
    const verdict = data as unknown as { allowed: boolean; retry_after_seconds: number } | null;
    if (verdict && verdict.allowed === false) {
      return {
        ok: false,
        code: 'rate_limited',
        message: 'Too many submissions from this connection. Try again shortly.',
        retryAfterSeconds: verdict.retry_after_seconds,
      };
    }
    return { ok: true };
  } catch {
    return { ok: true }; // fail open — see checkIpRateLimit for the reasoning
  }
}

// ---------------------------------------------------------------------------
// 3. daily spend ceiling
// ---------------------------------------------------------------------------

/** Percentages of the ceiling that earn an email, in ascending order. */
const ALERT_THRESHOLDS_PCT = [50, 75, 90] as const;

const SPEND_SCOPE = 'vision';

/**
 * Sums today's ai_jobs.cost_cents (UTC day) against the ceiling from
 * lib/ai/budget.ts, which resolves AI_DAILY_SPEND_CEILING_CENTS and falls
 * back to DEFAULT_DAILY_CEILING_CENTS when it is unset. A ceiling of 0 means
 * AI spending is switched off, matching checkBudget's reading of the same
 * value — 0 is off, not unlimited.
 *
 * Checked BEFORE the call, so the ceiling is a stop rather than a report.
 *
 * OVERSHOOT, stated honestly: this is a read, not a reservation. N requests
 * in flight concurrently all see the same pre-spend total, so the ceiling can
 * be exceeded by up to N calls, not by one. N is bounded by the platform's
 * concurrency, not by anything in this file. Closing that window entirely
 * needs a reserve-then-settle counter; the warning emails below exist partly
 * because this residual is real.
 */
export async function checkDailySpendCeiling(): Promise<GuardVerdict> {
  const ceilingCents = dailyCeilingCents();

  if (ceilingCents === 0) {
    return {
      ok: false,
      code: 'daily_ceiling',
      message: 'Instant analysis is briefly unavailable.',
    };
  }

  let spent: number;
  try {
    const db = getSupabaseAdminClient();
    const { data, error } = await db.rpc('ai_spend_today_cents');
    if (error) throw error;
    if (typeof data !== 'number') throw new Error('ai_spend_today_cents returned a non-number');
    spent = data;
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

  // Fire-and-forget. A mail provider having a bad day must never be the
  // reason a homeowner's analysis is refused.
  void maybeAlertOnSpend(spent, ceilingCents).catch(() => {});

  if (spent >= ceilingCents) {
    return {
      ok: false,
      code: 'daily_ceiling',
      message: 'Instant analysis is briefly unavailable.',
    };
  }
  return { ok: true };
}

/**
 * THE WARNING THAT ARRIVES BEFORE THE WALL.
 *
 * Without this, the first signal that spend is running away is contractors
 * ringing to ask why their quote widget stopped working — by which point the
 * outage is already happening across every paying site at once, because the
 * ceiling is global. Fifty percent of a day's budget consumed is a fact worth
 * knowing while there is still time to act on it.
 *
 * claim_spend_alert (0011_spend_guard.sql) guarantees one email per threshold
 * per UTC day even under concurrent crossings, so an attack produces three
 * emails rather than three thousand.
 */
async function maybeAlertOnSpend(spentCents: number, ceilingCents: number): Promise<void> {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to || ceilingCents <= 0) return;

  const pct = (spentCents / ceilingCents) * 100;
  const crossed = ALERT_THRESHOLDS_PCT.filter((t) => pct >= t);
  if (crossed.length === 0) return;

  // Only the highest threshold crossed is worth an email; the lower ones are
  // still claimed so that a later run doesn't send them retroactively.
  const highest = crossed[crossed.length - 1];
  const db = getSupabaseAdminClient();

  let shouldSend = false;
  for (const threshold of crossed) {
    const { data, error } = await db.rpc('claim_spend_alert', {
      p_scope: SPEND_SCOPE,
      p_threshold_pct: threshold,
      p_spent_cents: spentCents,
      p_ceiling_cents: ceilingCents,
    });
    if (error) return;
    if (data === true && threshold === highest) shouldSend = true;
  }
  if (!shouldSend) return;

  const money = (c: number) => '$' + (c / 100).toFixed(2);
  await sendBillingEmail({
    to,
    subject: `AI spend at ${Math.round(pct)}% of today's ceiling`,
    body: [
      `**${money(spentCents)} of ${money(ceilingCents)}** spent on AI so far today (UTC).`,
      `At **${money(ceilingCents)}** the photo-analysis path stops and every live site drops to manual entry. Lead capture keeps running; homeowners see the degraded flow, not a billing message.`,
      `If this is not expected traffic, the fastest lever is lowering AI_DAILY_SPEND_CEILING_CENTS in Vercel — it takes effect on the next request without a redeploy.`,
      `Resets at 00:00 UTC.`,
    ].join('\n\n'),
  });
}

// ---------------------------------------------------------------------------
// 4. client address
// ---------------------------------------------------------------------------

/**
 * The client address, from headers the client cannot forge.
 *
 * WHAT WAS WRONG BEFORE: this read x-forwarded-for and took element [0]. That
 * is the LEFTMOST entry of a header the caller supplies, so a request could
 * name its own rate-limit bucket. Sending a different value per request gave
 * every request a fresh bucket, and the per-IP limiter — the layer this
 * function exists to feed — counted to one over and over. Twelve per hour
 * became unbounded, for free, from a shell loop.
 *
 * WHAT IS RIGHT NOW: prefer x-vercel-forwarded-for, which the platform sets
 * and overwrites on ingress and which a client therefore cannot influence.
 * Then x-real-ip, same reasoning. Only then fall back to x-forwarded-for, and
 * take the RIGHTMOST entry — the hop nearest our own proxy — because
 * attacker-supplied values can only ever be prepended to the left of what the
 * proxy appends. Rightmost is correct whether the platform overwrites the
 * header or appends to it, which is what makes it the safe default while the
 * platform's exact behaviour is being confirmed.
 *
 * VERIFY: confirm on the deployed build that x-vercel-forwarded-for is
 * present. The behavioural test is in the Phase 12A notes — fifteen requests
 * with one spoofed XFF should start refusing, fifteen with rotating XFF
 * should also start refusing. Before this change the second run never did.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const vercel = headers.get('x-vercel-forwarded-for');
  if (vercel) {
    const trimmed = vercel.split(',')[0]?.trim();
    if (trimmed) return trimmed;
  }

  const real = headers.get('x-real-ip');
  if (real && real.trim()) return real.trim();

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }

  return null;
}
