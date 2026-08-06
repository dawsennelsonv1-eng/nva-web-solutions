'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getMemberDb } from '@/lib/companies/db';
import { requireMember, seesAllLeads } from '@/lib/auth/member';

/**
 * app/actions/member.ts — the member surface's writes.
 *
 * EVERY QUERY HERE GOES THROUGH getMemberDb(), the cookie-bound client, so RLS
 * runs. The role checks below are therefore a SECOND layer, not the only one:
 * if this file forgot one, Postgres would still refuse the row. That ordering
 * is intentional — the check in TypeScript exists to produce a sentence a
 * person can read, and the policy exists to be correct.
 */

export async function signOutMemberAction(): Promise<never> {
  const db = createSupabaseServerClient();
  await db.auth.signOut();
  redirect('/login');
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const LEAD_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'] as const;
type LeadStatus = (typeof LEAD_STATUSES)[number];

function isLeadStatus(v: string): v is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(v);
}

/**
 * Move a lead through the pipeline. Any member who can SEE a lead may advance
 * it — a crew member marking his own lead contacted is the whole point of
 * giving him a login, and requiring a foreman to do it would make the crew
 * role useless.
 */
export async function setLeadStatusAction(leadId: string, status: string): Promise<ActionResult> {
  const member = await requireMember();
  if (!member) return { ok: false, error: 'No company is attached to this account.' };
  if (!isLeadStatus(status)) return { ok: false, error: 'That is not a lead status.' };

  const db = getMemberDb();
  const { error } = await db.from('leads').update({ status }).eq('id', leadId);
  // leads_member_update refuses a lead outside the caller's scope, so an error
  // here is genuinely a failure rather than a permission decision — a denied
  // update simply affects zero rows.
  if (error) return { ok: false, error: 'Could not update that lead.' };

  revalidatePath('/app/leads');
  return { ok: true };
}

/**
 * Assign a lead to a crew member. Principals and foremen only.
 *
 * Assignment is what makes the crew role mean anything: 0014's leads_member_read
 * shows a crew member only rows whose assigned_to is his own membership id, so
 * this action is the mechanism by which a crew member sees anything at all.
 *
 * Passing null unassigns, which returns the lead to principal/foreman-only
 * visibility rather than making it public within the company.
 */
export async function assignLeadAction(
  leadId: string,
  memberId: string | null
): Promise<ActionResult> {
  const member = await requireMember();
  if (!member) return { ok: false, error: 'No company is attached to this account.' };
  if (!seesAllLeads(member.role)) {
    return { ok: false, error: 'Only a principal or a foreman can assign leads.' };
  }

  const db = getMemberDb();

  // The target must be on the SAME company. Without this a principal could
  // assign a lead to a membership id belonging to another company — RLS on
  // leads would permit the write, because the policy checks the LEAD's
  // tenancy, not the assignee's. This is the one place the database cannot
  // decide for us.
  if (memberId !== null) {
    const { data: target } = await db
      .from('company_members')
      .select('id')
      .eq('id', memberId)
      .eq('company_id', member.companyId)
      .maybeSingle<{ id: string }>();
    if (!target) return { ok: false, error: 'That person is not on your company.' };
  }

  const { error } = await db.from('leads').update({ assigned_to: memberId }).eq('id', leadId);
  if (error) return { ok: false, error: 'Could not assign that lead.' };

  revalidatePath('/app/leads');
  return { ok: true };
}
