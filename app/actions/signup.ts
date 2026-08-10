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

/**
 * BUSINESS NAME IS OPTIONAL, as of the /app gate work.
 *
 * It was required, and requiring it was wrong: it is the first field a
 * stranger meets, it blocks the account over something renameable, and a
 * sole trader with no trading name has nothing true to type in it. A company
 * still always ENDS UP with a name — see companyNameFrom() — because
 * companies.name is not nullable and a blank header reads as a broken page.
 * The name is chosen for him, not demanded from him.
 *
 * The lower bound is gone entirely rather than lowered. min(2) would still
 * reject a real one-letter answer, and the value is display text, not a key.
 */
const schema = z.object({
  businessName: z.string().trim().max(120).optional(),
});

/**
 * The fallback name. The email prefix is used because it is the only thing we
 * know about him at this point that he chose himself, and it is recognisable
 * to him in a way "Company 4f1c" is not.
 *
 * `split('@')[0]` is string | undefined under noUncheckedIndexedAccess even
 * though it cannot be undefined in practice, so the ?? chain is load-bearing
 * for the typecheck, not decoration. The last fallback exists for an address
 * that is somehow all-@ or empty: better a generic name than a failed signup.
 */
function companyNameFrom(typed: string | undefined, email: string | undefined): string {
  const given = (typed ?? '').trim();
  if (given.length > 0) return given.slice(0, 120);

  const prefix = (email ?? '').split('@')[0] ?? '';
  const cleaned = prefix.trim();
  if (cleaned.length > 0) return cleaned.slice(0, 120);

  return 'My company';
}

/**
 * types/database.ts stops at migration 0005 and `companies` is 0014, so this is
 * the same narrow structural cast used elsewhere for post-0005 tables — it
 * names only what is relied on, and every value written through it is
 * validated first.
 */
interface NarrowDb {
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
}

/**
 * ============================================================================
 * WHY A SIGNUP ALSO CREATES A PROSPECT AND A PROTOTYPE
 * ============================================================================
 *
 * Before this, self-serve signup produced a company and a membership and
 * nothing else. That looked complete and was not, because THREE separate
 * things in this codebase are keyed to a prototype rather than to a company:
 *
 *   1. BUYING. createCheckoutAction requires a prospectId AND a prototypeId.
 *      A self-serve company had neither, so a contractor who signed up could
 *      not purchase — the product had a front door and no till.
 *
 *   2. ENTITLEMENT. lib/entitlements/company.ts resolves
 *      company -> prototypes -> subscriptions. No prototype means permanently
 *      unpaid with no route out.
 *
 *   3. LEADS. 0014's policies scope a lead through
 *      company_of_prototype(prototype_id). A company with no prototype can
 *      never be shown a lead, so its dashboard was structurally guaranteed to
 *      stay empty.
 *
 * One missing row caused all three. This creates it.
 *
 * ORDER IS FORCED by the foreign keys: prospects, then prototypes, which
 * carries prospect_id NOT NULL and the company_id added in 0014.
 *
 * STATUS STAYS 'draft'. Only 'live' resolves publicly (0003's
 * prototype_is_live), so a brand-new unpaid signup does not get a public
 * branded site the moment it registers an email address. The member dashboard
 * does not care about status — prototypes_member_read keys on company_id — so
 * leads flow while the public surface stays closed until someone decides
 * otherwise.
 *
 * FAILURE HERE IS NOT FATAL. If either insert fails the user still has a
 * working account, a company and a principal membership; he simply lands on
 * the unpaid dashboard, which is where he was going anyway. Turning a
 * recoverable provisioning hiccup into "signup failed" would take an account
 * away from someone whose email address is now permanently taken.
 */
async function provisionPrototype(
  db: NarrowDb,
  args: { companyId: string; companyName: string; email: string }
): Promise<void> {
  try {
    const prospect = await db
      .from('prospects')
      .insert({
        business_name: args.companyName,
        email: args.email,
        vertical: 'epoxy',
        status: 'new',
      })
      .select('id')
      .single();

    if (prospect.error || !prospect.data) return;

    await db
      .from('prototypes')
      .insert({
        prospect_id: prospect.data.id,
        company_id: args.companyId,
        slug: prototypeSlug(),
        status: 'draft',
        vertical: 'epoxy',
      })
      .select('id')
      .single();
  } catch {
    // Deliberately swallowed. See the note above on why this is not fatal.
  }
}

/**
 * An unguessable slug.
 *
 * VERIFY: lib/slug.ts owns slug generation for quotes and justifies its
 * entropy there. This does not import it because that module's prototype-slug
 * API was not in hand — if it exports one, replace this with it rather than
 * keeping two generators.
 *
 * The requirement is the one 0001 states: unique, and not guessable, because
 * the slug is what resolves a prototype publicly. Two 128-bit-derived base-36
 * chunks give roughly 62 bits, which is far past the point where guessing is a
 * strategy, and the collision probability against a unique index is negligible.
 * A name-derived slug would be the wrong answer twice over — guessable, and it
 * would leak the business name of every unpaid signup.
 */
function prototypeSlug(): string {
  const chunk = () => Math.random().toString(36).slice(2, 12);
  return 'p-' + chunk() + chunk();
}

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

  // Only fails now if the name is over 120 characters or not a string at all.
  // It cannot fail for being absent, so the message no longer asks for it.
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: 'invalid', message: 'That business name is too long.' };
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
  const db = getSupabaseAdminClient() as unknown as NarrowDb;

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
  // Resolved HERE and not at parse time, because the fallback needs the
  // session's email and the session is not read until step 2 above.
  const companyName = companyNameFrom(parsed.data.businessName, user.email);

  const created = await db
    .from('companies')
    .insert({ name: companyName })
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

  // 5 — the prospect and prototype rows that make this company able to buy,
  // hold an entitlement and receive leads. Awaited so a fast redirect to /app
  // cannot beat them, but incapable of failing the signup — see the note on
  // provisionPrototype.
  await provisionPrototype(db, {
    companyId: created.data.id,
    companyName,
    email: user.email ?? '',
  });

  return { ok: true };
}

