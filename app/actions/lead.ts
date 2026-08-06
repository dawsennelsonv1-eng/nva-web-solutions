'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { calculateQuote, type QuoteComputation } from '@/lib/quote/pricing';
import { generateQuotePublicId } from '@/lib/slug';
import { checkScopedRateLimit, clientIpFromHeaders } from '@/lib/quote/guards';
import { trackServer } from '@/lib/analytics.server';
import { notifyAdminOfDemoLead, sendDemoContractorConfirmation } from '@/lib/notify/email';
import { generateMockLead, type MockLead } from '@/lib/demo/mockLead';
import { DEMO_RULES, DEMO_VERTICAL } from '@/lib/demo/config';
import type { DbDegradedReason, Surface } from '@/types';

/**
 * app/actions/lead.ts — DUAL ROUTING: one engine, two entry surfaces.
 *
 * "Dual routing" names the actual shape of what's built here: the SAME live
 * widget, the SAME server actions, and the SAME split-screen payoff serve
 * two routes — the public hub hero (`surface: 'public_hub'`) and the
 * dedicated `/demo` funnel (`surface: 'demo'`) — differing only in that
 * label, which flows straight into `leads.source` and every analytics event.
 * Two marketing entry points, one conversion mechanism. If a different
 * meaning was intended for "dual routing," this is the one VERIFY item at
 * the bottom of this delivery flags for confirmation.
 *
 * ORDER OF OPERATIONS in submitDemoLead, and why it can't reorder:
 *   1. rate limit           — bounds abuse before touching the database
 *   2. shape validation     — a malformed request never reaches a write
 *   3. duplicate check      — a double-tap or retry must not create two rows
 *   4. write the lead       — THE ONE THING THAT MAY NOT FAIL SILENTLY
 *   5. notifications        — fired, never awaited-to-block, outcome logged
 *   6. return the payload   — Side A is the real data; Side B is the mock
 */

const captureSchema = z.object({
  surface: z.enum(['public_hub', 'demo']),
  sessionId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  phone: z.string().min(10),
  email: z.string().trim().email().max(160),
  timeline: z.string().trim().min(1).max(80),
  wasDegraded: z.boolean(),
  degradedReason: z.enum(['cap_reached', 'subscription_suspended', 'ai_unavailable']).nullable(),
  quotePublicId: z.string().nullable(),
  timeInWidgetMs: z.number().nonnegative().optional(),
  /**
   * Storage path of the finish render the homeowner was shown, if he asked for
   * one. Phase 14.
   *
   * BOUNDED AND OPTIONAL. It arrives from the browser, so it is attacker-
   * controlled like every other field here — but unlike name or phone it is
   * never displayed to the homeowner and never used to fetch anything the
   * caller does not already have. The worst a forged value can do is put a
   * wrong path on one lead, which the contractor sees as a broken image rather
   * than as anything dangerous. The length cap stops it being used as a text
   * sink; the bucket's own RLS decides who may actually read a path.
   */
  renderPath: z.string().trim().max(300).nullable().optional(),
});

export type SubmitDemoLeadInput = z.infer<typeof captureSchema>;

export interface SideAPayload {
  name: string;
  phone: string;
  email: string;
  timeline: string;
  submittedAt: string;
  notificationPreview: string;
}

export interface SplitScreenPayload {
  sideA: SideAPayload;
  sideB: MockLead;
  leadId: string;
  quotePublicId: string | null;
}

export type SubmitDemoLeadResult =
  | { ok: true; payload: SplitScreenPayload }
  | { ok: false; error: string };

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? '+1' + digits : '+' + digits;
}

/**
 * Recomputes server-side from the client-supplied inputs — never trusts
 * client-computed cents (the same rule Phase 3's persistQuoteAction
 * enforces for the real product) — and persists a quote row with
 * prototype_id null, exactly as DATA_MODEL.md §6 specifies for a demo quote.
 */
export async function persistDemoQuote(
  computation: QuoteComputation,
  args: { surface: Surface; sessionId: string; usedAiAnalysis: boolean; photoPath?: string | null }
): Promise<string | null> {
  try {
    const recomputed = calculateQuote(computation.inputs, DEMO_RULES);
    const publicId = generateQuotePublicId();
    const db = getSupabaseAdminClient();
    const { error } = await db.from('quotes').insert({
      public_id: publicId,
      prototype_id: null,
      vertical: DEMO_VERTICAL,
      inputs: JSON.parse(JSON.stringify(recomputed.inputs)),
      low_cents: recomputed.lowCents,
      high_cents: recomputed.highCents,
      breakdown: JSON.parse(
        JSON.stringify({
          lines: recomputed.lines,
          midpointCents: recomputed.midpointCents,
          modifiersApplied: recomputed.modifiersApplied,
          minimumApplied: recomputed.minimumApplied,
          rangeSpreadPct: recomputed.rangeSpreadPct,
        })
      ),
      used_ai_analysis: args.usedAiAnalysis,
      was_capped: false,
      session_id: args.sessionId,
      photo_path: args.photoPath ?? null,
    });
    if (error) return null;
    trackServer(
      'quote_calculated',
      { low_cents: recomputed.lowCents, high_cents: recomputed.highCents, used_ai_analysis: args.usedAiAnalysis },
      { surface: args.surface, mode: 'live', sessionId: args.sessionId, prototypeId: null }
    );
    return publicId;
  } catch {
    // A demo quote failing to persist must not block the lead that follows —
    // the same posture Phase 3 takes for the real product.
    return null;
  }
}

export async function submitDemoLead(rawInput: unknown): Promise<SubmitDemoLeadResult> {
  const parsed = captureSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'Please check your details and try again.' };
  const input = parsed.data;

  const evtCtx = { surface: input.surface, mode: 'live' as const, sessionId: input.sessionId, prototypeId: null };

  // 1 — rate limit: 5 submissions per 10 minutes per connection. A generous
  // ceiling for a real visitor, a real one for a script hammering the form.
  const ip = clientIpFromHeaders(headers());
  const rate = await checkScopedRateLimit(ip, 'demo_lead_submit', 600, 5);
  if (!rate.ok) {
    trackServer('rate_limit_triggered', { endpoint: 'submitDemoLead' }, evtCtx);
    return { ok: false, error: rate.message ?? 'Please try again in a few minutes.' };
  }

  const db = getSupabaseAdminClient();
  const phone = normalizePhone(input.phone);
  const email = input.email.toLowerCase();

  // A very fast submission is a SOFT signal, recorded for admin visibility,
  // never a hard rejection — a genuine fast typer must never lose their lead
  // over a heuristic (the one rule every phase of this build repeats).
  const fastSubmit = typeof input.timeInWidgetMs === 'number' && input.timeInWidgetMs < 2500;

  // 3 — duplicate guard: a double-tap or a retried request must not create a
  // second row. 15 minutes is generous enough to absorb a real resubmission
  // (a network hiccup, a page refresh) without ever conflating two distinct
  // visits from the same person hours apart.
  const dedupeSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: existingRows } = await db
    .from('leads')
    .select('id, quote_id, created_at, name, phone, email, timeline')
    .eq('phone', phone)
    .eq('email', email)
    .in('source', ['public_hub', 'demo'])
    .gte('created_at', dedupeSince)
    .order('created_at', { ascending: false })
    .limit(1);

  let leadId: string;
  let quotePublicId: string | null = input.quotePublicId;
  let submittedAt: string;
  let isNewLead = true;

  const existing = existingRows?.[0];
  if (existing) {
    isNewLead = false;
    leadId = existing.id;
    submittedAt = existing.created_at;
    // Keep whichever quote reference the ORIGINAL submission carried; a
    // resubmit from a fresh widget session may not have reached the pricing
    // step again and would otherwise overwrite a real link with null.
    if (existing.quote_id && !quotePublicId) {
      const { data: qRow } = await db.from('quotes').select('public_id').eq('id', existing.quote_id).maybeSingle();
      quotePublicId = qRow?.public_id ?? null;
    }
  } else {
    let quoteUuid: string | null = null;
    if (input.quotePublicId) {
      const { data: qRow } = await db.from('quotes').select('id').eq('public_id', input.quotePublicId).maybeSingle();
      quoteUuid = qRow?.id ?? null;
    }

    const { data: inserted, error } = await db
      .from('leads')
      .insert({
        source: input.surface,
        prototype_id: null,
        quote_id: quoteUuid,
        name: input.name,
        phone,
        email,
        timeline: input.timeline,
        was_degraded: input.wasDegraded,
        degraded_reason: input.wasDegraded ? input.degradedReason : null,
        render_path: input.renderPath ?? null,
        delivery_status: { bot_signal: { fast_submit: fastSubmit, time_in_widget_ms: input.timeInWidgetMs ?? null } },
      })
      .select('id, created_at')
      .single();

    if (error || !inserted) {
      // THE ONE FAILURE THAT MAY NOT HAPPEN SILENTLY. Surface it plainly so
      // the widget's own retry copy (StepCapture / DegradedFlow) can show —
      // never a generic "something went wrong."
      return { ok: false, error: 'We could not save your details. Please try again.' };
    }
    leadId = inserted.id;
    submittedAt = inserted.created_at;
  }

  if (isNewLead) {
    trackServer(
      'lead_captured',
      { was_degraded: input.wasDegraded, degraded_reason: input.wasDegraded ? input.degradedReason : null, has_quote: Boolean(quotePublicId) },
      evtCtx
    );
    if (input.wasDegraded && input.degradedReason) {
      trackServer('degraded_lead_captured', { reason: input.degradedReason }, evtCtx);
    }
    trackServer('demo_lead_submitted', {}, evtCtx);
  }

  // 5 — notifications. Fired, never awaited before responding, and their
  // outcome is best-effort logged rather than gating anything downstream —
  // exactly the "non-blocking" posture the spec requires for both sends.
  const emailFields = { name: input.name, phone, email, timeline: input.timeline, surface: input.surface, createdAt: submittedAt };
  void notifyAdminOfDemoLead(emailFields)
    .then((r) => {
      if (r.status === 'failed' && process.env.NODE_ENV === 'development') {
        console.warn('[lead] admin notify failed:', r.error);
      }
    })
    .catch(() => {});
  void sendDemoContractorConfirmation(emailFields).catch(() => {});
  // SMS: intentionally stubbed. No SMS_PROVIDER_KEY-backed send exists yet
  // (ENV.md marks it Phase 5.5+); recorded here so delivery_status reflects
  // reality rather than implying a channel that doesn't fire.
  trackServer('webhook_received', { provider: 'sms_stub', event_type: 'not_implemented', was_duplicate: false }, evtCtx);

  const sideA: SideAPayload = {
    name: input.name,
    phone,
    email,
    timeline: input.timeline,
    submittedAt,
    notificationPreview:
      'New lead — ' + input.name + ' (' + phone + ') — ' + input.timeline.toLowerCase() + '.' +
      (quotePublicId ? ' Quote attached.' : ' No instant price attached — call to quote.'),
  };

  return {
    ok: true,
    payload: {
      sideA,
      sideB: generateMockLead(input.sessionId),
      leadId,
      quotePublicId,
    },
  };
}

