import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getProviderById } from '@/lib/payments';
import { processBillingEvent } from '@/lib/billing/process';
import { trackServer } from '@/lib/analytics.server';

/**
 * app/api/webhooks/paypal/route.ts — THE ONLY THING THAT MAY GRANT AN
 * ENTITLEMENT ON THE PAYPAL RAIL.
 *
 * Mirrors app/api/webhooks/stripe/route.ts step for step, because the ordering
 * below is the design and it is provider-independent:
 *
 *   1. READ THE RAW BODY FIRST, as text. PayPal verifies the exact bytes it
 *      sent. Parsing to JSON and re-serialising changes key order and
 *      whitespace and the verification will fail — the most common way a
 *      webhook endpoint ends up silently rejecting everything.
 *   2. VERIFY. Unverified requests are rejected and never touch the database.
 *      Without this, anyone could POST a fake "sale completed" and provision
 *      themselves.
 *   3. INSERT INTO webhook_events. The UNIQUE constraint on provider_event_id
 *      IS the idempotency mechanism — the database is the lock. A conflict
 *      means this exact event was already handled; acknowledge and return.
 *   4. PROCESS. Failures are recorded for retry.
 *   5. RETURN 2xx ONCE STORED. A 500 makes PayPal retry, and since the event
 *      is already stored every retry is wasted work on both sides.
 *
 * ============================================================================
 * HOW THIS DIFFERS FROM THE STRIPE ROUTE — READ BEFORE EDITING
 * ============================================================================
 *
 * VERIFICATION IS A NETWORK CALL, NOT AN HMAC. Stripe hands over a header that
 * can be checked offline with node:crypto. PayPal requires POSTing the event
 * back to /v1/notifications/verify-webhook-signature with five transmission
 * headers and PAYPAL_WEBHOOK_ID.
 *
 * The consequence: verification can fail for reasons that are not forgery — a
 * timeout, a PayPal outage. Those are reported as a failed verification, which
 * returns non-2xx, which makes PayPal retry. That is correct. Treating an
 * unverifiable event as valid would grant a paid entitlement on an
 * unauthenticated request.
 *
 * THE PROVIDER IS PINNED TO 'paypal' BY THIS ROUTE'S PATH, never resolved from
 * the admin toggle. A webhook is answered by the provider that sent it. Both
 * rails can have in-flight events during a switch and both must keep working.
 *
 * runtime = 'nodejs' is kept: the rest of the pipeline (supabase admin client,
 * billing processor) is Node-oriented, and there is no benefit to Edge on a
 * path that already makes an outbound verification call.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  // 1 — raw body, byte-exact
  const rawBody = await req.text();
  /**
   * PayPal does not send one signature header. Verification needs five
   * transmission headers, and PaymentProvider.handleWebhook takes a single
   * string because Stripe uses one.
   *
   * They are packed into that string as JSON here and unpacked in
   * lib/payments/paypal.ts. Widening the interface would have meant changing
   * Stripe's implementation and every caller to carry a shape one provider
   * needs; the packing is confined to this file and that function.
   *
   * A missing header is left undefined rather than defaulted — PayPal's
   * verification endpoint must be the thing that rejects it, not us guessing.
   */
  const signature = JSON.stringify({
    transmission_id: req.headers.get('paypal-transmission-id'),
    transmission_time: req.headers.get('paypal-transmission-time'),
    cert_url: req.headers.get('paypal-cert-url'),
    auth_algo: req.headers.get('paypal-auth-algo'),
    transmission_sig: req.headers.get('paypal-transmission-sig'),
  });

  // 2 — verify + normalise in one step (the provider contract deliberately
  // offers no way to parse without verifying first)
  const provider = getProviderById('paypal');
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
      // this is the normal, expected result of a PayPal retry.
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
    { error: 'This endpoint accepts POST from PayPal only.' },
    { status: 405 }
  );
}

