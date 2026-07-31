import { listLeadsAction, type LeadFilters } from '@/app/actions/leads';
import { LeadsInbox } from '@/components/admin/LeadsInbox';
import type { DbLeadSource, DbLeadStatus } from '@/types/database';

/**
 * /admin/leads — real inbox, replacing the Phase 1 stub. The server
 * component owns the query (filters come from the URL); LeadsInbox owns the
 * interaction (filter pills writing back to that URL, and the drawer).
 */
export const dynamic = 'force-dynamic';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { source?: string; status?: string };
}) {
  const filters: LeadFilters = {
    source: (searchParams.source as DbLeadSource) ?? 'all',
    status: (searchParams.status as DbLeadStatus) ?? 'all',
  };
  const leads = await listLeadsAction(filters);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="font-display font-condensed text-2xl font-bold uppercase tracking-wide">Leads</h1>
      <div className="mt-4">
        <LeadsInbox leads={leads} />
      </div>
    </div>
  );
}
