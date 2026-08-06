import { NextResponse } from 'next/server';
import { runRetentionPass, RETENTION_DAYS } from '@/lib/storage/retention';

/**
 * app/api/cron/retention/route.ts — the nightly photo expiry.
 *
 * Same shape and same auth as /api/cron/dunning: Vercel signs cron requests
 * with CRON_SECRET, and this endpoint is a public URL, so an unauthenticated
 * caller could otherwise force-run a DELETION pass. That makes the check
 * matter more here than on the dunning route — the worst a forced dunning run
 * does is send an email a day early.
 *
 * runRetentionPass is idempotent: deleting an already-deleted object is not an
 * error in Supabase Storage, so a retry or a manual trigger is harmless.
 *
 * SCHEDULED AFTER DUNNING, not before. Both are nightly and both are bounded,
 * but dunning moves money and this only reclaims disk — if the two ever
 * contend for the same 60-second window, the one that can cost a customer his
 * account should go first.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Unset in development so the endpoint is exercisable locally; in
  // production a missing secret means we refuse rather than run open.
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === 'Bearer ' + secret;
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await runRetentionPass();
    return NextResponse.json({ ok: true, retentionDays: RETENTION_DAYS, ...result });
  } catch (e) {
    console.error('[cron/retention] failed:', e);
    return NextResponse.json({ ok: false, error: 'retention_pass_failed' }, { status: 500 });
  }
}
