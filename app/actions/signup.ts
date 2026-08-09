'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { checkScopedRateLimit, clientIpFromHeaders } from '@/lib/quote/guards';

/**
 * app/actions/signup.ts — turn a fresh auth user into a company principal.
 *
 * ============================================================================
 * THIS CHANGES WHO CAN CREATE A TENANT. SAYING SO OUT LOUD.
 * ============================================================================
 *
 * Before this file, a `companies` row could only be created by an admin.
 * 0014_companies.sql has no non-admin insert policy on `companies`, and
 * `members_principal_write` requires the caller to ALREADY be a principal of
 * the company being written to — a deliberate chicken-and-egg that made
 * self-serve tenancy impossible through RLS.
 *
 * That is now bypassed here with the service-role client, on purpose, because
 * the operator asked for self-serve signup. It is a real business change: any
 * visitor with an email address can create a company.
 *
 * THE RLS IS NOT WEAKENED. No policy changed, and no other path gained the
 * ability to create a company. This one server-side function is the entire new
 * surface, which is why it carries the guards below rather than trusting the
 * database to catch anything.
 *
 * ============================================================================
 * WHY THIS IS A SEPARATE STEP FROM signUp()
 * ============================================================================
 *
 * The account is created on the BROWSER client, matching MemberLoginForm:
 * @supabase/ssr sets the session cookies as part of that call, and routing it
 * through a server action would mean authenticating twice.
 *
 * So by the time this runs, the caller is already signed in — and this reads
 * the identity from the SESSION rather than taking a user id as an argument.
 * That distinction is the security of this function: an argument can be forged
 * by anyone who can POST to a server action; a cookie-bound session cannot.
 *
 * ============================================================================
 * THE ORDER OF THE TWO INSERTS MATTERS
 * ============================================================================
 *
 * Company first, membership second. If the second fails, the result is an
 * orphan company with no members — invisible, harmless, and cleanable.
 *
 * The reverse would be worse: there is no membership without a company_id to
 * point at, so it cannot even be attempted. And a partially provisioned user
 * who holds a session but no membership is bounced by middleware to
 * /login?reason=no_company, which is an existing, handled state — not a crash.
 */

const schema = z.object({
  businessName: z.string().trim().min(2).max(120),
});

export type SignupProvisionResult =
  | { ok: true }
  | { ok: false; code: 'invalid' | 'not_signed_in' | 'already_provisioned' | 'rate_limited' | 'failed'; message: string };

export async function provisionCompanyAction(raw: unknown): Promise<SignupProvisionResult> {
  // 1 — rate limit. Email verification is disabled on this project, so there is
  // no cost to creating an account and this action would otherwise be a free
  // company generator for anyone with a script.
  const ip = clientIpFromHeaders(headers());
  const rate = await checkScopedRateLimit(ip, 'signup_provision', 3600, 5);
  if (!rate.ok) {
    return {
      ok: false,
      code: 'rate_limited',
      message: rate.message ?? 'Too many accounts from this connection. Try again later.',
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: 'invalid', message: 'Enter your business name.' };
  }

  // 2 — identity from the session, never from an argument.
  const session = createSupabaseServerClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) {
    return {
      ok: false,
      code: 'not_signed_in',
      message: 'Your session did not stick. Sign in and we will finish setting up.',
    };
  }

  /**
   * The service-role client. types/database.ts stops at migration 0005 and
   * `companies` is 0014, so this is the same narrow structural cast used
   * elsewhere for post-0005 tables — it names only what is relied on, and the
   * values are validated above.
   */
  const db = getSupabaseAdminClient() as unknown as {
    from(table: string): {
      select(cols: string): {
        eq(col: string, val: string): {
          maybeSingle(): Promise<{ data: { id: string } | null }>;
        };
      };
      insert(values: Record<string, unknown>): {
        select(cols: string): {
          single(): Promise<{ data: { id: string } | null; error: unknown }>;
        };
      } & Promise<{ error: unknown }>;
    };
  };

  // 3 — one company per person. Without this a double-tap, a retry, or a
  // refresh mid-request creates a second company and the user silently ends up
  // a principal of two, with leads split across them.
  const existing = await db
    .from('company_members')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing.data) {
    return {
      ok: false,
      code: 'already_provisioned',
      message: 'That account already belongs to a company.',
    };
  }

  // 4 — company, then membership.
  const created = await db
    .from('companies')
    .insert({ name: parsed.data.businessName })
    .select('id')
    .single();

  if (created.error || !created.data) {
    return {
      ok: false,
      code: 'failed',
      message: 'We could not finish setting up your account. Try again in a moment.',
    };
  }

  const { error: memberError } = await db.from('company_members').insert({
    company_id: created.data.id,
    user_id: user.id,
    email: user.email ?? '',
    // principal: this person owns the company they just created. Any other role
    // would lock them out of their own account — a crew member cannot invite,
    // cannot change rates, and cannot see the team screen.
    role: 'principal',
  });

  if (memberError) {
    return {
      ok: false,
      code: 'failed',
      message:
        'Your account was created but we could not attach it to your business. Sign in and contact support.',
    };
  }

  return { ok: true };
}
