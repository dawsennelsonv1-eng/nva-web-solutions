'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { checkScopedRateLimit, clientIpFromHeaders } from '@/lib/quote/guards';

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
 * THE TYPE CAST ON THE INSERT — READ THIS
 * ============================================================================
 *
 * types/database.ts is hand-written and its own header says it matches
 * migrations 0001–0005. The repo is on 0016, and `implementation_requests` is
 * 0017, so this table does not exist in the generated types and the client is
 * typed without it.
 *
 * The cast below is the narrowest possible workaround: it is applied at the
 * `.from()` call only, the inserted object is still fully typed by Zod above
 * it, and nothing downstream consumes an untyped row. CONVENTIONS.md §8 bans
 * `skipLibCheck` tricks to make a build pass — this is not that; the code is
 * correct and the type file is stale.
 *
 * THE REAL FIX is adding this table to types/database.ts. That file is large,
 * hand-maintained, and was not in scope here; adding a table to it blind is how
 * a hand-written type file starts disagreeing with the schema in ways nothing
 * catches. Do it in the same session you run the migration, with the migration
 * open beside it.
 *
 * ============================================================================
 * VERIFY: NOBODY IS EMAILED WHEN THIS FIRES
 * ============================================================================
 *
 * A row lands in the table and nothing tells you about it. lib/notify/email.ts
 * exists and lead.ts uses notifyAdminOfDemoLead(), but that function's argument
 * is shaped for a homeowner lead — name, phone, timeline, priceRange, renderUrl
 * — and its `surface` is typed to 'public_hub' | 'demo'. Forcing an
 * implementation request through it would send you an email that misdescribes
 * what arrived.
 *
 * So until a notifier for this shape exists, CHECK THE TABLE. This is the one
 * thing in this phase that will silently cost you a customer if it is
 * forgotten, which is why it is at the top of the file rather than the bottom.
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
   * The cast, and why it is a cast rather than @ts-expect-error.
   *
   * A @ts-expect-error here would be correct today and would FAIL THE BUILD the
   * moment types/database.ts is brought up to date, because the error it
   * expects would stop happening. That turns a good deed into a red deploy.
   *
   * This structural cast compiles either way. It names exactly what is being
   * relied on — a `from` that takes a table name and an `insert` that returns
   * an error — and nothing wider. The values are already fully validated by Zod
   * above, so no untyped data reaches the database and no untyped row leaves it.
   */
  const db = getSupabaseAdminClient() as unknown as {
    from(table: string): {
      insert(values: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
    };
  };

  const { error } = await db.from('implementation_requests').insert({
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
    });

  if (error) {
    return {
      ok: false,
      code: 'write_failed',
      message: 'We could not save that. Try again in a moment, or email us directly.',
    };
  }

  return { ok: true };
}
