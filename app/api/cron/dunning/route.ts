import { NextResponse } from 'next/server';
import { runDunningPass } from '@/lib/billing/dunning';

/**
 * app/api/cron/dunning/route.ts — the daily dunning clock.
 *
 * Invoked by Vercel Cron (see vercel.json). Vercel signs cron requests with
 * the CRON_SECRET env var in an Authorization header; we verify it because
 * this endpoint is a public URL and an unauthenticated caller could
 * otherwise force-advance every contractor's dunning timeline.
 *
 * runDunningPass is idempotent — the UNIQUE (subscription_id, day_number,
 * channel) constraint on dunning_events means a double invocation cannot
 * double-send. So a retried or manually-triggered run is safe.
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
    const result = await runDunningPass();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // Returning 500 here IS correct, unlike the webhook route: a cron failure
    // should surface in Vercel's log and be retried tomorrow, and there is no
    // upstream retry storm to worry about.
    console.error('[cron/dunning] failed:', e);
    return NextResponse.json({ ok: false, error: 'dunning_pass_failed' }, { status: 500 });
  }
}
