import 'server-only';
import { DEFAULT_ADMIN_RATE_PER_DAY, DEFAULT_ADMIN_RATE_PER_MIN } from './config';
import { countJobsSince } from './jobs';

/**
 * lib/ai/ratelimit.ts — two limits, because they stop two different accidents.
 *
 *  PER MINUTE, per admin: a stuck finger on the Run button, or a panel left
 *  open in a tab that retries. Checked in memory first because it has to be
 *  instant, then against the ledger.
 *
 *  PER DAY, everyone: the backstop for a script someone wrote against this
 *  endpoint. The spend ceiling already bounds the money; this bounds the
 *  number of rows and the provider-side rate limits we would otherwise trip.
 *
 * HONEST LIMITATION: the in-memory half is per lambda instance, so a burst
 * spread across cold starts can exceed the minute limit. That is why the
 * ledger check exists behind it, and why the spend ceiling — which reads a
 * single shared number — is the guard that actually protects the money.
 */

const burst = new Map<string, number[]>();

function limitFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type RateDecision =
  | { allowed: true }
  | { allowed: false; message: string; retryAfterSeconds: number };

export async function checkAdminRate(adminId: string): Promise<RateDecision> {
  const perMin = limitFromEnv('AI_ADMIN_RATE_PER_MIN', DEFAULT_ADMIN_RATE_PER_MIN);
  const perDay = limitFromEnv('AI_ADMIN_RATE_PER_DAY', DEFAULT_ADMIN_RATE_PER_DAY);
  const now = Date.now();

  const recent = (burst.get(adminId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= perMin) {
    return {
      allowed: false,
      message: `That is ${perMin} runs in a minute. Wait a moment before running another.`,
      retryAfterSeconds: 60,
    };
  }
  recent.push(now);
  burst.set(adminId, recent);
  if (burst.size > 200) pruneBurst(now);

  const minuteAgo = new Date(now - 60_000).toISOString();
  const recorded = await countJobsSince(minuteAgo, adminId);
  if (recorded !== null && recorded >= perMin) {
    return {
      allowed: false,
      message: `That is ${perMin} runs in a minute. Wait a moment before running another.`,
      retryAfterSeconds: 60,
    };
  }

  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const today = await countJobsSince(midnight.toISOString());
  if (today !== null && today >= perDay) {
    return {
      allowed: false,
      message: `The daily limit of ${perDay} AI runs is used up. It resets at 00:00 UTC.`,
      retryAfterSeconds: 3600,
    };
  }

  return { allowed: true };
}

function pruneBurst(now: number): void {
  for (const [key, times] of burst) {
    const kept = times.filter((t) => now - t < 60_000);
    if (kept.length === 0) burst.delete(key);
    else burst.set(key, kept);
  }
}
