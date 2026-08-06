import 'server-only';
import { getMemberDb } from '@/lib/companies/db';

/**
 * lib/auth/member.ts — WHO IS THIS, AND WHAT MAY HE SEE.
 *
 * The member-side counterpart to lib/auth/admin.ts. Same shape, different
 * population: a contractor's principal, foremen and crew rather than us.
 *
 * ============================================================================
 * THIS USES THE COOKIE-BOUND CLIENT. NEVER THE SERVICE ROLE.
 * ============================================================================
 *
 * That is the single most important line in this file. lib/supabase/admin.ts
 * is service_role and BYPASSES ROW LEVEL SECURITY entirely — every policy in
 * 0014_companies.sql stops existing for any query made through it.
 *
 * So every member-facing read in this codebase goes through
 * createSupabaseServerClient(), which carries the user's own cookie, which
 * means the policies actually run. If a member-facing feature is ever written
 * against the admin client, the RLS is decorative and one contractor will
 * eventually see another's leads. CONVENTIONS.md already forbids it; after
 * 0014 the cost of breaking that rule went from "a bug" to "the business."
 *
 * ============================================================================
 * ONE MEMBERSHIP, NOT MANY — FOR NOW
 * ============================================================================
 *
 * The schema permits a user to belong to several companies: company_members is
 * unique on (company_id, user_id), not on user_id alone. That is deliberate —
 * a bookkeeper working for two contractors is a real thing.
 *
 * This function returns the FIRST membership, oldest first, because there is
 * no company switcher in the UI yet and picking arbitrarily would mean a
 * two-company user silently seeing a different company on different visits.
 * Oldest-first is at least stable. `otherCompanyCount` is returned so a
 * surface can say "you belong to more than one company" honestly rather than
 * pretending the second does not exist.
 *
 * When the switcher is built, this takes an optional company id and validates
 * it against the membership list. Nothing else changes.
 */

export type CompanyRole = 'principal' | 'foreman' | 'crew';

export interface MemberIdentity {
  userId: string;
  email: string;
  /** company_members.id — the row leads are assigned to. */
  memberId: string;
  companyId: string;
  companyName: string;
  role: CompanyRole;
  /** Memberships beyond the one resolved here. Usually 0. */
  otherCompanyCount: number;
}

/** Principals and foremen see every lead on the company; crew see only theirs. */
export function seesAllLeads(role: CompanyRole): boolean {
  return role === 'principal' || role === 'foreman';
}

export function canManageSeats(role: CompanyRole): boolean {
  return role === 'principal';
}

/**
 * Resolves the signed-in user's membership, or null.
 *
 * NULL HAS TWO MEANINGS and the caller must not conflate them: nobody is
 * signed in, or somebody is signed in who belongs to no company. Middleware
 * has already handled the first for any /app route, so at those call sites
 * null means the second — a real person whose invite has not been accepted or
 * whose seat was removed. That is a support conversation, not an attack, and
 * the layout says so instead of destroying the session.
 */
export async function requireMember(): Promise<MemberIdentity | null> {
  try {
    const db = getMemberDb();

    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user?.email) return null;

    // RLS members_read allows a member to read rows for companies he belongs
    // to, so this returns his own memberships and nothing else — even though
    // the query has no user_id filter of its own.
    const { data: memberships, error } = await db
      .from('company_members')
      .select('id, company_id, role, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error || !memberships || memberships.length === 0) return null;

    const primary = memberships[0] as
      | { id: string; company_id: string; role: string }
      | undefined;
    if (!primary) return null;

    const { data: company } = await db
      .from('companies')
      .select('name')
      .eq('id', primary.company_id)
      .maybeSingle<{ name: string }>();

    return {
      userId: user.id,
      email: user.email,
      memberId: primary.id,
      companyId: primary.company_id,
      companyName: company?.name ?? 'Your company',
      role: primary.role as CompanyRole,
      otherCompanyCount: memberships.length - 1,
    };
  } catch {
    return null;
  }
}
