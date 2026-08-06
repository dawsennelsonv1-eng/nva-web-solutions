import { requireMember, seesAllLeads } from '@/lib/auth/member';
import { getMemberDb } from '@/lib/companies/db';
import { LeadRows, type LeadRow, type Assignee } from '@/components/member/LeadRows';

export const dynamic = 'force-dynamic';

/**
 * /app/leads — the pipeline.
 *
 * NO COMPANY FILTER IN THE QUERY, on purpose. 0014's leads_member_read already
 * answers for the caller: every lead on the company for a principal or foreman,
 * only assigned leads for crew. Adding a redundant `.eq('company_id', ...)`
 * here would imply the filter is what protects the data, and the next person
 * to write a query would believe it.
 *
 * A /demo lead has a null prototype_id and belongs to us, not to a contractor.
 * The policy excludes it. Nothing here has to know that.
 */
export default async function MemberLeadsPage() {
  const member = await requireMember();
  if (!member) return null;

  const db = getMemberDb();

  const { data } = await db
    .from('leads')
    .select('id, name, phone, email, status, created_at, assigned_to, was_degraded')
    .order('created_at', { ascending: false })
    .limit(200);

  const raw = (data ?? []) as {
    id: string;
    name: string;
    phone: string;
    email: string;
    status: string;
    created_at: string;
    assigned_to: string | null;
    was_degraded: boolean;
  }[];

  const leads: LeadRow[] = raw.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    status: r.status,
    createdAt: r.created_at,
    assignedTo: r.assigned_to,
    wasDegraded: r.was_degraded,
  }));

  const canAssign = seesAllLeads(member.role);
  let assignees: Assignee[] = [];
  if (canAssign) {
    const { data: team } = await db.from('company_members').select('id, email').order('email');
    assignees = ((team ?? []) as { id: string; email: string }[]).map((t) => ({
      id: t.id,
      email: t.email,
    }));
  }

  return (
    <>
      <h1 className="font-display text-2xl font-extrabold uppercase">Leads</h1>
      <p className="mt-1 text-base text-rule">
        {canAssign
          ? 'Every lead on this account, newest first.'
          : 'The leads assigned to you, newest first.'}
      </p>

      {leads.length === 0 ? (
        <p className="mt-6 border border-rule bg-sheet p-4 text-base">
          {canAssign
            ? 'No leads yet. They appear the moment somebody finishes a quote on your site.'
            : 'Nothing is assigned to you yet.'}
        </p>
      ) : (
        <LeadRows leads={leads} assignees={assignees} canAssign={canAssign} />
      )}
    </>
  );
}
