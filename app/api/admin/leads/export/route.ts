import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { getLeadsForExportAction } from '@/app/actions/leads';
import type { DbLeadSource, DbLeadStatus } from '@/types/database';

/**
 * app/api/admin/leads/export/route.ts — CSV download.
 *
 * A ROUTE HANDLER, not a Server Action: a download needs real response
 * headers (Content-Type, Content-Disposition) to make the browser save a
 * file instead of navigating to a blob of text, and Server Actions return
 * data, not a Response. requireAdmin() gates this exactly like every
 * mutating action — a GET is not automatically safe just because it doesn't
 * write anything; this reads every lead's contact details.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const source = (url.searchParams.get('source') ?? 'all') as DbLeadSource | 'all';
  const status = (url.searchParams.get('status') ?? 'all') as DbLeadStatus | 'all';

  const leads = await getLeadsForExportAction({ source, status });

  const header = ['Name', 'Phone', 'Email', 'Source', 'Status', 'Degraded', 'Degraded Reason', 'Has Quote', 'Created At'];
  const rows = leads.map((l) => [
    l.name, l.phone, l.email, l.source, l.status,
    l.wasDegraded ? 'yes' : 'no',
    l.degradedReason ?? '',
    l.hasQuote ? 'yes' : 'no',
    l.createdAt,
  ]);

  const csv = [header, ...rows].map((row) => row.map((c) => csvEscape(String(c))).join(',')).join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="leads-' + new Date().toISOString().slice(0, 10) + '.csv"',
    },
  });
}
