'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getMemberDb } from '@/lib/companies/db';
import { requireMember, canManageSeats, type CompanyRole } from '@/lib/auth/member';

/**
 * app/actions/team.ts — SEATS.
 *
 * ============================================================================
 * WHICH CLIENT DOES WHAT, AND WHY IT IS SPLIT
 * ============================================================================
 *
 * This file uses BOTH Supabase clients, which is unusual in this codebase and
 * is the thing to understand before editing it.
 *
 *   getMemberDb()            cookie-bound. Every read and write of
 *                            company_members goes through here, so 0014's
 *                            members_principal_write / _update / _delete
 *                            policies actually run. A crew member calling
 *                            these actions directly is refused by POSTGRES,
 *                            not by the `canManageSeats` check below.
 *
 *   getSupabaseAdminClient() service_role. Used for EXACTLY ONE THING:
 *                            creating the Supabase Auth identity. Creating a
 *                            user is an auth-admin operation and there is no
 *                            cookie-bound equivalent — a principal cannot mint
 *                            an auth user as himself.
 *
 * The membership row is deliberately NOT written with the admin client even
 * though it is already in scope. That would bypass RLS for the one write that
 * decides who can see a company's leads, which is precisely the write that
 * must not be able to skip the policy.
 *
 * ============================================================================
 * SEATS ARE ENFORCED HERE, AND ONLY HERE
 * ============================================================================
 *
 * 0014 deliberately made seat_limit a plain column with no trigger, so that an
 * over-seated company can be fixed by an admin without editing SQL. The cost of
 * that choice is that THIS FILE is the enforcement. There is no second net.
 *
 * seat_limit itself is unwritable by a principal — 0014 revokes UPDATE on the
 * column and grants back only `name` — so a contractor cannot raise his own
 * ceiling. Raising it is a billing event and belongs to service_role.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** Set when the invite succeeded but no email was sent. See inviteMember. */
  note?: string;
}

const ROLES: CompanyRole[] = ['principal', 'foreman', 'crew'];

function isRole(v: string): v is CompanyRole {
  return (ROLES as string[]).includes(v);
}

function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function inviteMemberAction(rawEmail: string, rawRole: string): Promise<ActionResult> {
  const member = await requireMember();
  if (!member) return { ok: false, error: 'No company is attached to this account.' };
  if (!canManageSeats(member.role)) {
    return { ok: false, error: 'Only the principal can add people.' };
  }

  const email = normaliseEmail(rawEmail);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: 'That is not an email address.' };
  }
  if (!isRole(rawRole)) return { ok: false, error: 'That is not a role.' };

  const db = getMemberDb();

  // ---- seat check -----------------------------------------------------------
  const { data: company } = await db
    .from('companies')
    .select('seat_limit')
    .eq('id', member.companyId)
    .maybeSingle<{ seat_limit: number }>();
  if (!company) return { ok: false, error: 'Could not read this account.' };

  const { data: existingRows } = await db
    .from('company_members')
    .select('id, email')
    .eq('company_id', member.companyId);
  const existing = (existingRows ?? []) as { id: string; email: string }[];

  if (existing.some((m) => normaliseEmail(m.email) === email)) {
    return { ok: false, error: 'That person is already on this account.' };
  }
  if (existing.length >= company.seat_limit) {
    return {
      ok: false,
      error: `This account has ${company.seat_limit} seat${
        company.seat_limit === 1 ? '' : 's'
      } and all of them are used. Adding another is a billing change.`,
    };
  }

  // ---- auth identity --------------------------------------------------------
  const admin = getSupabaseAdminClient();
  let userId: string | null = null;
  let emailed = true;

  const invited = await admin.auth.admin.inviteUserByEmail(email);
  if (invited.data?.user) {
    userId = invited.data.user.id;
  } else {
    /**
     * The invite failed, and the overwhelmingly likely reason is that this
     * person already has a sign-in — a foreman who works for two contractors,
     * or somebody re-added after being removed. Supabase refuses to invite an
     * existing user and does not return their id when it refuses.
     *
     * So the id is found by scanning the user list. THIS IS A BOUNDED SCAN and
     * its bound is a real limit: it reads the first 1000 accounts and no more.
     * At current scale that is everyone. It stops being correct somewhere past
     * a thousand users, at which point this needs an index — a lookup table
     * keyed by email, or the admin API's filter once it is available. Written
     * down here rather than discovered as a silent failure to add somebody.
     */
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users.find((u) => normaliseEmail(u.email ?? '') === email);
    if (!found) {
      return {
        ok: false,
        error: 'Could not create a sign-in for that address. Check it and try again.',
      };
    }
    userId = found.id;
    // They already had an account, so Supabase sent nothing. The principal has
    // to tell them, and saying so is better than letting him assume an email
    // went out that never did.
    emailed = false;
  }

  // ---- membership, through RLS ---------------------------------------------
  const { error: insertError } = await db.from('company_members').insert({
    company_id: member.companyId,
    user_id: userId,
    email,
    role: rawRole,
  });
  if (insertError) {
    return {
      ok: false,
      error: 'The sign-in was created but adding them to this account failed. Try again.',
    };
  }

  revalidatePath('/app/team');
  return {
    ok: true,
    note: emailed
      ? undefined
      : 'They already had a sign-in, so no invite email was sent. Tell them to sign in at /login.',
  };
}

export async function setMemberRoleAction(
  memberId: string,
  rawRole: string
): Promise<ActionResult> {
  const member = await requireMember();
  if (!member) return { ok: false, error: 'No company is attached to this account.' };
  if (!canManageSeats(member.role)) {
    return { ok: false, error: 'Only the principal can change roles.' };
  }
  if (!isRole(rawRole)) return { ok: false, error: 'That is not a role.' };

  const db = getMemberDb();

  /**
   * THE LOCKOUT GUARD. A principal demoting the last principal — usually
   * himself, by accident, while tidying roles — leaves a company that nobody
   * can ever administer again. Every remaining member is refused by
   * members_principal_write, so the account can only be repaired by us, in
   * SQL, on a live database.
   *
   * The check is here rather than in a policy because RLS decides on rows, not
   * on the state of a table after a write. It costs one query and prevents a
   * class of support ticket that has no self-serve fix.
   */
  if (rawRole !== 'principal') {
    const { data: principalRows } = await db
      .from('company_members')
      .select('id')
      .eq('company_id', member.companyId)
      .eq('role', 'principal');
    const principals = (principalRows ?? []) as { id: string }[];
    if (principals.length <= 1 && principals.some((p) => p.id === memberId)) {
      return {
        ok: false,
        error: 'This is the only principal on the account. Make someone else a principal first.',
      };
    }
  }

  const { error } = await db.from('company_members').update({ role: rawRole }).eq('id', memberId);
  if (error) return { ok: false, error: 'Could not change that role.' };

  revalidatePath('/app/team');
  return { ok: true };
}

export async function removeMemberAction(memberId: string): Promise<ActionResult> {
  const member = await requireMember();
  if (!member) return { ok: false, error: 'No company is attached to this account.' };
  if (!canManageSeats(member.role)) {
    return { ok: false, error: 'Only the principal can remove people.' };
  }

  const db = getMemberDb();

  // Same lockout reasoning as above: removing the last principal orphans the
  // company just as effectively as demoting one.
  const { data: principalRows } = await db
    .from('company_members')
    .select('id')
    .eq('company_id', member.companyId)
    .eq('role', 'principal');
  const principals = (principalRows ?? []) as { id: string }[];
  if (principals.length <= 1 && principals.some((p) => p.id === memberId)) {
    return {
      ok: false,
      error: 'This is the only principal on the account and cannot be removed.',
    };
  }

  /**
   * THE AUTH USER IS NOT DELETED. Only the membership row is.
   *
   * A person can belong to more than one company — company_members is unique
   * on (company_id, user_id), not on user_id. Deleting the auth identity when
   * one contractor removes somebody would sign them out of a DIFFERENT
   * contractor's account, which is a cross-tenant side effect from a
   * single-tenant action.
   *
   * 0014 sets leads.assigned_to to null on delete, so their leads return to
   * principal-and-foreman visibility rather than disappearing.
   */
  const { error } = await db.from('company_members').delete().eq('id', memberId);
  if (error) return { ok: false, error: 'Could not remove that person.' };

  revalidatePath('/app/team');
  return { ok: true };
}
