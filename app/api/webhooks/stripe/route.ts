import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getPaymentProvider } from '@/lib/payments';
import { processBillingEvent } from '@/lib/billing/process';
import { trackServer } from '@/lib/analytics.server';

/**
 * app/api/webhooks/stripe/route.ts — THE ONLY THING IN THIS SYSTEM THAT MAY
 * GRANT AN ENTITLEMENT.
 *
 * runtime = 'nodejs' is REQUIRED, not defensive: signature verification uses
 * node:crypto's HMAC and timingSafeEqual, neither of which exists on Edge.
 *
 * THE ORDER BELOW IS THE WHOLE DESIGN, and none of it can be reordered:
 *
 *   1. READ THE RAW BODY FIRST, as text. The signature is computed over the
 *      exact bytes Stripe sent. Parsing to JSON and re-serialising changes
 *      key order and whitespace, which breaks the MAC — this is the single
 *      most common way a webhook endpoint ends up silently rejecting
 *      everything.
 *   2. VERIFY THE SIGNATURE. An unsigned or mis-signed request is rejected
 *      with 400 and never touches the database. Without this, anyone on the
 *      internet could POST a fake "invoice paid" and provision themselves.
 *   3. INSERT INTO webhook_events. The UNIQUE constraint on
 *      provider_event_id (0002_billing.sql) IS the idempotency mechanism —
 *      the database is the lock. A conflict means we have already seen this
 *      exact event, so we acknowledge and return WITHOUT reprocessing.
 *   4. PROCESS. Failures are written to processing_error for retry.
 *   5. RETURN 2xx ONCE STORED, ALWAYS. A 500 makes Stripe retry aggressively
 *      and, since the event is already stored, every retry hits the
 *      duplicate guard and achieves nothing but load. Storing the error and
 *      acknowledging is strictly better than hammering.
 *
 * The only paths that return non-2xx are ones where we did NOT store the
 * event: a bad signature, or a database that would not accept the insert.
 * Those are exactly the cases where a Stripe retry is genuinely useful.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  // 1 — raw body, byte-exact
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  // 2 — verify + normalise in one step (the provider contract deliberately
  // offers no way to parse without verifying first)
  const provider = getPaymentProvider();
  const verification = await provider.handleWebhook(rawBody, signature);

  if (!verification.ok) {
    if (verification.reason === 'not_configured') {
      console.error('[webhook] STRIPE_WEBHOOK_SECRET missing or provider has no webhook support');
      return NextResponse.json({ error: 'not_configured' }, { status: 500 });
    }
    // Do NOT log the body — an unverified payload is attacker-controlled.
    console.warn('[webhook] rejected:', verification.reason);
    return NextResponse.json({ error: verification.reason }, { status: 400 });
  }

  const db = getSupabaseAdminClient();
  const results: { id: string; note: string }[] = [];

  for (const event of verification.events) {
    // 3 — store first; the unique index decides whether we are the first to
    // see this event.
    const { error: insertError } = await db.from('webhook_events').insert({
      provider: 'stripe',
      provider_event_id: event.providerEventId,
      payload: JSON.parse(JSON.stringify(event.raw)),
    });

    if (insertError) {
      // 23505 = unique_violation = we already have it. Acknowledge silently;
      // this is the normal, expected result of a Stripe retry.
      if (insertError.code === '23505') {
        trackServer(
          'webhook_received',
          { provider: 'stripe', event_type: event.kind ?? 'unknown', was_duplicate: true },
          { surface: 'admin', mode: 'live', prototypeId: event.prototypeId }
        );
        results.push({ id: event.providerEventId, note: 'duplicate; not reprocessed' });
        continue;
      }
      // We could NOT store it. This is the one case a retry genuinely helps.
      console.error('[webhook] store failed:', insertError.message);
      return NextResponse.json({ error: 'store_failed' }, { status: 500 });
    }

    trackServer(
      'webhook_received',
      { provider: 'stripe', event_type: event.kind ?? 'unknown', was_duplicate: false },
      { surface: 'admin', mode: 'live', prototypeId: event.prototypeId }
    );

    // 4 — process. Never allowed to throw out of this loop.
    let outcome: { ok: boolean; note?: string; error?: string };
    try {
      outcome = await processBillingEvent(event);
    } catch (e) {
      outcome = { ok: false, error: e instanceof Error ? e.message : 'unknown processing error' };
    }

    await db
      .from('webhook_events')
      .update({
        processed_at: new Date().toISOString(),
        processing_error: outcome.ok ? null : (outcome.error ?? 'unknown'),
      })
      .eq('provider_event_id', event.providerEventId);

    if (!outcome.ok) {
      console.error('[webhook] processing failed for', event.providerEventId, outcome.error);
      trackServer(
        'webhook_processing_failed',
        { event_type: event.kind ?? 'unknown', error: outcome.error ?? 'unknown' },
        { surface: 'admin', mode: 'live', prototypeId: event.prototypeId }
      );
    }

    results.push({ id: event.providerEventId, note: outcome.note ?? outcome.error ?? '' });
  }

  // 5 — stored, therefore acknowledged, regardless of processing outcome.
  return NextResponse.json({ received: true, results }, { status: 200 });
}

/** A GET here is almost always a misconfigured endpoint URL; say so plainly. */
export function GET(): NextResponse {
  return NextResponse.json(
    { error: 'This endpoint accepts POST from Stripe only.' },
    { status: 405 }
  );
}
