import { requireMember, seesAllLeads } from '@/lib/auth/member';
import { getMemberDb } from '@/lib/companies/db';
import { LeadRows, type LeadRow, type Assignee } from '@/components/member/LeadRows';
import { LockedPanel } from '@/components/member/LockedPanel';
import { resolveCompanyAccess, hasFullAccess } from '@/lib/entitlements/company';

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
 *
 * THE ENTITLEMENT CHECK BELOW IS THIS PAGE'S OWN. The layout hides the nav
 * link for an unpaid account, but a hidden link is not a gate — a bookmark, a
 * back button or a typed URL all arrive here directly. The check is repeated
 * because it has to be.
 */
export default async function MemberLeadsPage() {
  const member = await requireMember();
  if (!member) return null;

  const access = await resolveCompanyAccess(member.companyId);
  if (!hasFullAccess(access)) {
    return (
      <LockedPanel
        title="Leads"
        blurb="Every quote finished on your site lands here with the customer's name, phone and the price they were shown, so you can call them back the same day."
      />
    );
  }

  const db = getMemberDb();

  const { data } = await db
    .from('leads')
    /**
     * quotes(low_cents, high_cents) is an EMBEDDED READ across the foreign
     * key, not a second query. Two hundred leads would otherwise be two
     * hundred round trips for a price each, which is the classic N+1 and would
     * make this page visibly slow exactly when a contractor is busiest.
     *
     * The embed is subject to the same RLS as a direct select — a member can
     * only reach quotes belonging to leads he can already see — so this widens
     * nothing.
     */
    .select(
      'id, name, phone, email, status, created_at, assigned_to, was_degraded, finish_spec, quotes(low_cents, high_cents)'
    )
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
    finish_spec: unknown;
    // Supabase returns an embedded to-one as an object, but older client
    // versions and some query shapes return a one-element array. Both are
    // handled rather than assumed — the difference is invisible until it is a
    // blank price column in production.
    quotes: { low_cents: number; high_cents: number } | { low_cents: number; high_cents: number }[] | null;
  }[];

  /**
   * The frozen specification lines, read defensively.
   *
   * finish_spec is jsonb with no schema the database enforces, so a row from
   * an older build or written by hand could hold anything. A malformed value
   * costs one lead its specification; it must never cost the contractor his
   * whole pipeline screen.
   */
  const summaryOf = (spec: unknown): string[] => {
    if (typeof spec !== 'object' || spec === null) return [];
    const summary = (spec as Record<string, unknown>).summary;
    if (!Array.isArray(summary)) return [];
    return summary.filter((l): l is string => typeof l === 'string').slice(0, 20);
  };

  const priceOf = (q: (typeof raw)[number]['quotes']): string | null => {
    const row = Array.isArray(q) ? q[0] : q;
    if (!row) return null;
    return (
      '$' + Math.round(row.low_cents / 100).toLocaleString('en-US') +
      ' – $' + Math.round(row.high_cents / 100).toLocaleString('en-US')
    );
  };

  const leads: LeadRow[] = raw.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    status: r.status,
    createdAt: r.created_at,
    assignedTo: r.assigned_to,
    wasDegraded: r.was_degraded,
    finishSummary: summaryOf(r.finish_spec),
    priceRange: priceOf(r.quotes),
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
      <p className="n15-eyebrow">Pipeline</p>
      <h1 className="mb-h">Leads</h1>
      <p className="mb-lede">
        {canAssign
          ? 'Every lead on this account, newest first. Each one already has a price.'
          : 'The leads assigned to you, newest first.'}
      </p>

      {leads.length === 0 ? (
        <div className="mb-panel">
          <h2 className="mb-panel-h">Nothing yet</h2>
          <p className="mb-panel-b">
            {canAssign
              ? 'Leads appear the moment somebody finishes a quote on your site — name, number, floor size and the range they were shown.'
              : 'Nothing is assigned to you yet.'}
          </p>
        </div>
      ) : (
        <LeadRows leads={leads} assignees={assignees} canAssign={canAssign} />
      )}
    </>
  );
}
