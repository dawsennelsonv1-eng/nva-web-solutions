'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { checkScopedRateLimit, clientIpFromHeaders } from '@/lib/quote/guards';
import { notifyAdminOfImplementationRequest } from '@/lib/notify/email';

/**
 * app/actions/implementation.ts — a contractor asking us to build something.
 *
 * ============================================================================
 * ORDER OF OPERATIONS, AND WHY IT CANNOT REORDER
 * ============================================================================
 *
 *   1. rate limit        bounds abuse before touching the database
 *   2. shape validation  a malformed request never reaches a write
 *   3. write the row     THE ONE THING THAT MAY NOT FAIL SILENTLY
 *   4. return
 *
 * The same order app/actions/lead.ts uses, for the same reasons.
 *
 * ============================================================================
 * NO DUPLICATE GUARD, DELIBERATELY — AND IT IS THE OPPOSITE CALL FROM lead.ts
 * ============================================================================
 *
 * submitDemoLead dedupes on phone+email inside fifteen minutes, because a
 * homeowner double-tapping a button must not create two identical leads.
 *
 * Here the risk runs the other way. A contractor might legitimately send two
 * requests in one sitting — one from the floor tool page, one describing a
 * different problem entirely — and silently swallowing the second would lose a
 * customer telling us exactly what to build. A duplicate row costs thirty
 * seconds of reading. A dropped request costs the request.
 *
 * The rate limit below is what stops a script; it is set at a ceiling a real
 * person will never reach.
 *
 * ============================================================================
 * FULLY TYPED AS OF PHASE 16K
 * ============================================================================
 *
 * This shipped with a structural cast on the insert, because types/database.ts
 * stopped at migration 0005 and this table is 0017. That table is now declared
 * there and the cast is gone — the insert is checked against the real column
 * list, so a renamed column fails the build instead of the request.
 *
 * ============================================================================
 * THE EMAIL IS AWAITED, AND THAT IS DELIBERATE
 * ============================================================================
 *
 * lib/notify/email.ts says callers "fire these and do not await them before
 * responding to the visitor". That advice is right for a long-lived server and
 * wrong here. On Vercel a serverless function is frozen the moment it returns,
 * so an un-awaited fetch is not backgrounded — it is killed, usually before the
 * request leaves. The email would silently never send.
 *
 * So it is awaited. The cost is bounded: sendViaResend carries its own 10s
 * AbortController, and a typical send is well under a second, against a form
 * that is already showing "Sending…".
 *
 * IT CANNOT FAIL THE REQUEST. The row is written FIRST and the result is
 * returned regardless of what the email does. A provider having a bad day must
 * never be the reason a contractor's enquiry is lost — that is the same rule
 * that governs lead capture, applied here.
 *
 * The outcome is recorded on the row so a silent misconfiguration is visible in
 * the table rather than invisible everywhere. 'skipped' means ADMIN_NOTIFY_EMAIL
 * or RESEND_API_KEY is unset; that is a real state, not an error, and it is
 * worth being able to see it.
 */

const schema = z.object({
  kind: z.enum(['tool_install', 'custom_build']),
  toolId: z.string().trim().min(1).max(60).nullable().optional(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(7).max(40).nullable().optional(),
  businessName: z.string().trim().min(2).max(160).nullable().optional(),
  businessField: z.string().trim().min(2).max(80).nullable().optional(),
  websiteUrl: z.string().trim().min(3).max(300).nullable().optional(),
  customerType: z.string().trim().min(2).max(200).nullable().optional(),
  description: z.string().trim().min(10).max(4000),
  source: z.string().trim().min(1).max(120).nullable().optional(),
});

export type ImplementationRequestInput = z.infer<typeof schema>;

export type ImplementationRequestResult =
  | { ok: true }
  | { ok: false; code: 'invalid' | 'rate_limited' | 'write_failed'; message: string };

/** Empty strings from an untouched optional input become null, not ''. */
function orNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

export async function submitImplementationRequest(
  rawInput: unknown
): Promise<ImplementationRequestResult> {
  // 1 — rate limit. Three per hour per connection: a real person sending two
  // requests in one sitting is expected and allowed; a script is not.
  const ip = clientIpFromHeaders(headers());
  const rate = await checkScopedRateLimit(ip, 'implementation_request', 3600, 3);
  if (!rate.ok) {
    return {
      ok: false,
      code: 'rate_limited',
      message:
        rate.message ??
        'You have sent a few of these already. Give it an hour, or email us directly.',
    };
  }

  // 2 — shape.
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) {
    // Named field, plain sentence, no error code and no stack — CONVENTIONS §5.
    const first = parsed.error.issues[0];
    const field = first?.path?.[0];
    return {
      ok: false,
      code: 'invalid',
      message:
        field === 'email'
          ? 'That email address does not look right. Check it and try again.'
          : field === 'description'
            ? 'Tell us a little more — a sentence or two about what you need.'
            : field === 'name'
              ? 'We need a name to put on this.'
              : 'Please check the form and try again.',
    };
  }
  const input = parsed.data;

  // 3 — the write. The one thing that may not fail silently.
  /**
   * No cast. types/database.ts gained `implementation_requests` in Phase 16K,
   * so the insert below is fully typed: a renamed column or a missing required
   * field is now a build error rather than a runtime constraint violation.
   */
  const db = getSupabaseAdminClient();

  const { data: inserted, error } = await db
    .from('implementation_requests')
    .insert({
      kind: input.kind,
      tool_id: orNull(input.toolId),
      name: input.name,
      email: input.email.toLowerCase(),
      phone: orNull(input.phone),
      business_name: orNull(input.businessName),
      business_field: orNull(input.businessField),
      website_url: orNull(input.websiteUrl),
      customer_type: orNull(input.customerType),
      description: input.description,
      source: orNull(input.source),
    })
    .select('id, created_at')
    .single();

  if (error || !inserted) {
    return {
      ok: false,
      code: 'write_failed',
      message: 'We could not save that. Try again in a moment, or email us directly.',
    };
  }

  // 4 — tell somebody. Never allowed to change the outcome above.
  const notified = await notifyAdminOfImplementationRequest({
    kind: input.kind,
    toolId: orNull(input.toolId),
    name: input.name,
    email: input.email.toLowerCase(),
    phone: orNull(input.phone),
    businessName: orNull(input.businessName),
    businessField: orNull(input.businessField),
    websiteUrl: orNull(input.websiteUrl),
    customerType: orNull(input.customerType),
    description: input.description,
    createdAt: inserted.created_at,
  });

  // Best effort. If this update fails the request still succeeded and the
  // contractor still gets his reply — losing the audit line is the cheapest
  // possible failure here, so it is swallowed rather than surfaced.
  await db
    .from('implementation_requests')
    .update({
      delivery_status: {
        admin_email: notified.status,
        ...(notified.error ? { admin_email_error: notified.error } : {}),
      },
    })
    .eq('id', inserted.id);

  return { ok: true };
}
