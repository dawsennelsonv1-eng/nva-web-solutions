'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { checkScopedRateLimit, clientIpFromHeaders } from '@/lib/quote/guards';
import { trackServer } from '@/lib/analytics.server';
import { sendBillingEmail } from '@/lib/notify/email';

/**
 * app/actions/prototypeLead.ts — lead capture for a REAL prototype, tested
 * (and possibly triggered for real) before the contractor has paid.
 *
 * DELIBERATELY NOT A GENERALISATION of app/actions/lead.ts's
 * submitDemoLead(). That function is correct for what it does — a fake
 * persona, prototype_id always null, notifications framed around the /demo
 * sales mechanic (Side A/B, "here's what you'd receive"). None of that
 * framing is true here: this lead is tied to a REAL prototype_id, and if a
 * real homeowner reaches this URL and submits it, it is a genuine business
 * lead for the contractor being pitched — not a simulation of one.
 * Stretching submitDemoLead to cover both would have meant branching its
 * notification copy and its prototype_id handling on a boolean, which is
 * exactly the shape of bug that hides a real lead behaving like a fake one.
 *
 * WHY LEAD CAPTURE WORKS HERE AT ALL, PRE-PURCHASE: lead.capture is in
 * NEVER_GATED, and 'prototype' mode's own entitlement branch never checks
 * subscription state (lib/prototype.ts, lib/entitlements/decideEntitlement.ts)
 * — so nothing in this system's design treats an unpurchased prototype as
 * unable to capture a real lead. That is also the strongest thing Dawsen can
 * show mid-call: "this already generated a real lead, and you haven't paid
 * for it yet."
 *
 * NOTIFICATION GOES TO THE ADMIN (Dawsen), not the contractor: a prospect
 * mid-sales-cycle has no inbox integration to receive it into, and framing
 * it as a sales signal ("someone just engaged with X's prototype") is a
 * more useful message than a raw lead forward would be at this stage.
 */

const captureSchema = z.object({
  prototypeId: z.string().uuid(),
  sessionId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  phone: z.string().min(10),
  email: z.string().trim().email().max(160),
  timeline: z.string().trim().min(1).max(80),
  wasDegraded: z.boolean(),
  degradedReason: z.enum(['cap_reached', 'subscription_suspended', 'ai_unavailable']).nullable(),
  quotePublicId: z.string().nullable(),
  timeInWidgetMs: z.number().nonnegative().optional(),
});

export type SubmitPrototypeLeadResult = { ok: true; leadId: string } | { ok: false; error: string };

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? '+1' + digits : '+' + digits;
}

export async function submitPrototypeLead(rawInput: unknown): Promise<SubmitPrototypeLeadResult> {
  const parsed = captureSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'Please check your details and try again.' };
  const input = parsed.data;

  const evtCtx = {
    surface: 'prototype' as const,
    mode: 'prototype' as const,
    sessionId: input.sessionId,
    prototypeId: input.prototypeId,
  };

  const ip = clientIpFromHeaders(headers());
  const rate = await checkScopedRateLimit(ip, 'prototype_lead_submit', 600, 5);
  if (!rate.ok) {
    trackServer('rate_limit_triggered', { endpoint: 'submitPrototypeLead' }, evtCtx);
    return { ok: false, error: rate.message ?? 'Please try again in a few minutes.' };
  }

  const db = getSupabaseAdminClient();
  const phone = normalizePhone(input.phone);
  const email = input.email.toLowerCase();
  const fastSubmit = typeof input.timeInWidgetMs === 'number' && input.timeInWidgetMs < 2500;

  // Same 15-minute dedupe window as submitDemoLead, scoped to THIS prototype
  // so a resubmission on one contractor's link can never match against another's.
  const dedupeSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: existingRows } = await db
    .from('leads')
    .select('id')
    .eq('phone', phone)
    .eq('email', email)
    .eq('prototype_id', input.prototypeId)
    .gte('created_at', dedupeSince)
    .order('created_at', { ascending: false })
    .limit(1);

  if (existingRows && existingRows.length > 0) {
    return { ok: true, leadId: existingRows[0]!.id };
  }

  let quoteUuid: string | null = null;
  if (input.quotePublicId) {
    const { data: qRow } = await db.from('quotes').select('id').eq('public_id', input.quotePublicId).maybeSingle();
    quoteUuid = qRow?.id ?? null;
  }

  const { data: inserted, error } = await db
    .from('leads')
    .insert({
      source: 'prototype',
      prototype_id: input.prototypeId,
      quote_id: quoteUuid,
      name: input.name,
      phone,
      email,
      timeline: input.timeline,
      was_degraded: input.wasDegraded,
      degraded_reason: input.wasDegraded ? input.degradedReason : null,
      delivery_status: { bot_signal: { fast_submit: fastSubmit, time_in_widget_ms: input.timeInWidgetMs ?? null } },
    })
    .select('id')
    .single();

  if (error || !inserted) {
    return { ok: false, error: 'We could not save your details. Please try again.' };
  }

  trackServer(
    'lead_captured',
    { was_degraded: input.wasDegraded, degraded_reason: input.wasDegraded ? input.degradedReason : null, has_quote: quoteUuid !== null },
    evtCtx
  );
  if (input.wasDegraded && input.degradedReason) {
    trackServer('degraded_lead_captured', { reason: input.degradedReason }, evtCtx);
  }

  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  if (adminEmail) {
    void sendBillingEmail({
      to: adminEmail,
      subject: 'Prototype activity: a real lead came through',
      body:
        'Someone just tested a prototype and left contact details — before it\u2019s even sold.\n\n' +
        '**' + input.name + '**\n' + phone + '\n' + email + '\nTimeline: ' + input.timeline + '\n\n' +
        'This is a genuinely strong thing to mention on the next call.',
    }).catch(() => {});
  }

  return { ok: true, leadId: inserted.id };
}
