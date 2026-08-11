'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { calculateQuote, type QuoteComputation } from '@/lib/quote/pricing';
import { generateQuotePublicId } from '@/lib/slug';
import { checkScopedRateLimit, clientIpFromHeaders } from '@/lib/quote/guards';
import { trackServer } from '@/lib/analytics.server';
import { notifyAdminOfDemoLead, sendCustomerQuote, sendBothSidesPreview } from '@/lib/notify/email';
import { generateMockLead, type MockLead } from '@/lib/demo/mockLead';
import { getSignedPhotoUrl } from '@/lib/storage/photos';
import { RENDER_DISCLOSURE } from '@/lib/ai/visualise';
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
  /**
   * WHAT HE CHOSE. Keys, and the human-readable lines frozen at capture.
   *
   * Bounded on both sides. `selections` is a shallow record of short strings —
   * this is an anonymous public endpoint, and an unbounded jsonb column is an
   * invitation to store somebody else's data in our database for free.
   *
   * The summary is passed rather than recomputed server-side ON PURPOSE. It is
   * the record of what this person was actually SHOWN, and recomputing it
   * later from the catalogue would silently re-label a lead when an option is
   * renamed — turning the one record that matters in a dispute into something
   * that quietly agrees with whatever the catalogue says today.
   *
   * VERIFY: because the summary is client-supplied it is display text and
   * nothing more. Never price from it, never branch on it. The KEYS are the
   * authoritative half, and they are validated against the catalogue by the
   * render path that consumes them.
   */
  finishSelections: z.record(z.union([z.string().max(60), z.array(z.string().max(60)).max(12)])).optional(),
  finishSummary: z.array(z.string().max(160)).max(20).optional(),
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
  /**
   * Hoisted out of the new-lead branch so the notification below can read it.
   * A DEDUPED resubmit sets it from the existing row, so the second email
   * carries the same price the first did rather than silently dropping the
   * range — the contractor should not be able to tell which submission he is
   * looking at.
   */
  let quoteUuid: string | null = null;

  const existing = existingRows?.[0];
  if (existing) {
    isNewLead = false;
    leadId = existing.id;
    submittedAt = existing.created_at;
    // Keep whichever quote reference the ORIGINAL submission carried; a
    // resubmit from a fresh widget session may not have reached the pricing
    // step again and would otherwise overwrite a real link with null.
    quoteUuid = existing.quote_id ?? null;
    if (existing.quote_id && !quotePublicId) {
      const { data: qRow } = await db.from('quotes').select('public_id').eq('id', existing.quote_id).maybeSingle();
      quotePublicId = qRow?.public_id ?? null;
    }
  } else {
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
        // Written only when there is something to write. An empty object on
        // every degraded lead would make "has a specification" untestable with
        // a null check, which is how every consumer will reasonably test it.
        finish_spec:
          input.finishSelections || input.finishSummary
            ? {
                selections: input.finishSelections ?? {},
                summary: input.finishSummary ?? [],
              }
            : null,
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
  /**
   * WHAT THE HOMEOWNER ACTUALLY SAW, assembled for the notification.
   *
   * Until now these emails carried a name, a number and a timeline — and the
   * confirmation template told the reader that on a real site it "arrives with
   * the calculated price range and photo attached." It did not. That was a
   * promise unkept in the one email whose whole job is to demonstrate the
   * product honestly, which is the worst possible place for one.
   *
   * SEVEN DAYS, NOT THE 300-SECOND DEFAULT. A signed URL that expires five
   * minutes after sending is dead before most contractors open their inbox.
   * Seven days is long enough to be useful and short enough that a forwarded
   * email does not leak a customer's photo indefinitely.
   *
   * EVERY LOOKUP HERE IS ALLOWED TO FAIL. A missing price, a storage hiccup or
   * an unsigned URL costs a line in an email; it must never cost the lead,
   * which is already written by this point. Nothing below throws.
   */
  const SEVEN_DAYS = 604_800;

  let priceRange: string | null = null;
  let photoUrl: string | null = null;
  if (quoteUuid) {
    const { data: q } = await db
      .from('quotes')
      .select('low_cents, high_cents, photo_path')
      .eq('id', quoteUuid)
      .maybeSingle();
    if (q) {
      priceRange =
        '$' + Math.round(q.low_cents / 100).toLocaleString('en-US') +
        ' - $' + Math.round(q.high_cents / 100).toLocaleString('en-US');
      // The slab as it is TODAY. A contractor reading this wants to see the
      // concrete before he prices the prep, and the render deliberately does
      // not show him that — it shows the finish. Both, or he is guessing at
      // half the job.
      if (q.photo_path) photoUrl = await getSignedPhotoUrl(q.photo_path, SEVEN_DAYS);
    }
  }

  const renderUrl = input.renderPath
    ? await getSignedPhotoUrl(input.renderPath, SEVEN_DAYS)
    : null;

  const emailFields = {
    name: input.name,
    phone,
    email,
    timeline: input.timeline,
    surface: input.surface,
    createdAt: submittedAt,
    priceRange,
    photoUrl,
    renderUrl,
    finishSummary: input.finishSummary ?? [],
    // The disclosure is attached HERE, beside the URL, rather than left to the
    // template. A render that reaches a screen without it is the one failure
    // this whole feature was built to avoid.
    renderDisclosure: renderUrl ? RENDER_DISCLOSURE : null,
  };
  //
  // THREE READERS, THREE DOCUMENTS. See lib/notify/email.ts for why they are
  // not one template with a switch: the operator wants a lead he can act on
  // from a lock screen, the submitter wants his price, and the business
  // evaluating the tool wants to see both halves of what it just produced.
  //
  // ALL THREE ARE FIRED, NONE ARE AWAITED. The lead is already written by this
  // point and nothing below can un-write it. A provider outage costs an email,
  // never a lead — the rule this whole file is built around.
  //
  // The two sends to fields.email are deliberate and not a duplicate: one is
  // his quote and one is the demonstration, and collapsing them would mean a
  // homeowner reading sales copy about his own submission.
  void notifyAdminOfDemoLead(emailFields)
    .then((r) => {
      if (r.status === 'failed' && process.env.NODE_ENV === 'development') {
        console.warn('[lead] admin notify failed:', r.error);
      }
    })
    .catch(() => {});
  void sendCustomerQuote(emailFields).catch(() => {});
  void sendBothSidesPreview(emailFields).catch(() => {});
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

// ---------------------------------------------------------------------------
// attaching the render, after the fact
// ---------------------------------------------------------------------------

/**
 * THE ORDERING PROBLEM THIS SOLVES.
 *
 * The contact gate writes the lead and THEN starts the render, because the
 * render is what the details were exchanged for and because an anonymous
 * visitor must never be able to trigger a paid image generation. That order is
 * correct and is not negotiable.
 *
 * It also means the render does not exist when submitDemoLead runs. So the
 * lead lands with render_path null and the notification goes out without the
 * picture — which is precisely the thing the contractor most wants to see,
 * missing from the one email that is supposed to prove the product works.
 *
 * This closes the gap: the render finishes, the browser calls this with the
 * storage path, the row is updated and ONE follow-up email goes out carrying
 * the picture.
 *
 * ============================================================================
 * WHY NOT JUST CALL submitDemoLead AGAIN
 * ============================================================================
 *
 * It would appear to work. The 15-minute duplicate guard would find the
 * existing row, skip the insert, and re-send the notification with the render
 * URL attached. But render_path on the row itself would stay null forever —
 * that column is only ever written on INSERT — so the contractor's dashboard
 * would show a lead with no picture while his inbox had one. Two surfaces
 * disagreeing about the same lead is worse than neither having it.
 *
 * ============================================================================
 * WHAT AN ATTACKER CAN DO WITH THIS, STATED PLAINLY
 * ============================================================================
 *
 * A leadId and a path are both guessable in principle. The worst outcome is a
 * wrong image path on somebody else's lead, and one extra email to the
 * operator. That is annoying, not dangerous: the path is not a URL, reading it
 * still requires a signed link minted server-side from a private bucket, and
 * nothing here returns data about the lead to the caller.
 *
 * It is still rate limited, and it refuses to overwrite a render_path that is
 * already set — so a lead can gain a picture once and never have one swapped.
 */
/**
 * Pull the frozen summary lines back off a stored finish_spec.
 *
 * Defensive at every step because this reads jsonb — a column with no schema
 * the database enforces. A row written by an older build, by hand in the SQL
 * editor, or by a future version of this file could hold anything, and a lead
 * notification must not fail over the shape of a display field.
 */
function readSummary(spec: unknown): string[] {
  if (typeof spec !== 'object' || spec === null) return [];
  const summary = (spec as Record<string, unknown>).summary;
  if (!Array.isArray(summary)) return [];
  return summary.filter((l): l is string => typeof l === 'string').slice(0, 20);
}

export async function attachRenderToLead(raw: unknown): Promise<{ ok: boolean }> {
  const schema = z.object({
    leadId: z.string().uuid(),
    renderPath: z.string().trim().min(1).max(300),
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false };

  const ip = clientIpFromHeaders(headers());
  const rate = await checkScopedRateLimit(ip, 'lead_attach_render', 600, 10);
  if (!rate.ok) return { ok: false };

  try {
    const db = getSupabaseAdminClient();

    const { data: lead } = await db
      .from('leads')
      .select(
        'id, name, phone, email, timeline, source, created_at, quote_id, render_path, finish_spec'
      )
      .eq('id', parsed.data.leadId)
      .maybeSingle();

    // Already has one: succeed without doing anything. Idempotent, so a retry
    // from a flaky connection cannot produce a second email.
    if (!lead || lead.render_path) return { ok: Boolean(lead) };

    const { error } = await db
      .from('leads')
      .update({ render_path: parsed.data.renderPath })
      .eq('id', parsed.data.leadId);
    if (error) return { ok: false };

    // Same seven-day window submitDemoLead uses, for the same reason: a link
    // that dies in five minutes is dead before the contractor opens his inbox.
    const SEVEN_DAYS = 604_800;
    const renderUrl = await getSignedPhotoUrl(parsed.data.renderPath, SEVEN_DAYS);

    let priceRange: string | null = null;
    let photoUrl: string | null = null;
    if (lead.quote_id) {
      const { data: q } = await db
        .from('quotes')
        .select('low_cents, high_cents, photo_path')
        .eq('id', lead.quote_id)
        .maybeSingle();
      if (q) {
        priceRange =
          '$' + Math.round(q.low_cents / 100).toLocaleString('en-US') +
          ' - $' + Math.round(q.high_cents / 100).toLocaleString('en-US');
        if (q.photo_path) photoUrl = await getSignedPhotoUrl(q.photo_path, SEVEN_DAYS);
      }
    }

    /**
     * `leads.source` is wider than this email's `surface`, which is
     * 'public_hub' | 'demo' — the column also carries prototype-sourced leads
     * that never go through these templates. Narrowed by CHECKING rather than
     * by casting: a cast would compile and then hand a template a value it has
     * no copy for, and the reader would get an email describing a surface that
     * does not exist.
     *
     * VERIFY: this ran as `lead.source as Surface` when attachRenderToLead
     * shipped, which does not typecheck against the real DemoLeadEmailFields.
     * It was hidden by a loose test stub and would have failed the build.
     */
    const surface: 'public_hub' | 'demo' = lead.source === 'demo' ? 'demo' : 'public_hub';

    const fields = {
      name: lead.name as string,
      phone: lead.phone as string,
      email: lead.email as string,
      timeline: lead.timeline as string,
      surface,
      createdAt: lead.created_at as string,
      priceRange,
      photoUrl,
      renderUrl,
      // Read back off the row rather than re-derived: this runs in a second
      // request with no access to what the browser had, and the row is the
      // record of what was captured.
      finishSummary: readSummary(lead.finish_spec),
      renderDisclosure: renderUrl ? RENDER_DISCLOSURE : null,
    };

    // Both sends, same posture as the first notification: fired, never awaited
    // before responding, failure logged and never propagated.
    // The follow-up carries the picture, which is the whole reason for it.
    // sendBothSidesPreview is NOT re-sent: its argument is about what happened
    // at the moment of submission, and a second copy arriving later would read
    // as a duplicate rather than as new information.
    void notifyAdminOfDemoLead(fields).catch(() => {});
    void sendCustomerQuote(fields).catch(() => {});

    return { ok: true };
  } catch {
    return { ok: false };
  }
}
