import { requireMember, seesAllLeads } from '@/lib/auth/member';
import { getMemberDb } from '@/lib/companies/db';

export const dynamic = 'force-dynamic';

/**
 * /app — the overview.
 *
 * EVERY NUMBER HERE IS COUNTED THROUGH RLS. There is not one company filter in
 * the queries below, and there does not need to be: the policies in 0014 mean
 * a member's `select count(*) from leads` already answers for his company
 * only, and a crew member's answers for his own assigned leads only. A
 * forgotten filter returns too little, never too much — which is the direction
 * a tenancy mistake should fail in.
 *
 * WHAT A CREW MEMBER SEES IS A SMALLER, TRUE VERSION of what a principal sees,
 * not a restricted view of the principal's numbers. His "new leads" figure is
 * the count of HIS new leads. The label changes with the role so the number is
 * never ambiguous.
 *
 * NO FABRICATED METRICS. Conversion rate is shown only once there is at least
 * one won or lost lead — a rate computed from an empty pipeline is 0%, which
 * reads as failure rather than as absence.
 */
export default async function MemberOverviewPage() {
  const member = await requireMember();
  if (!member) return null; // layout already handled this

  const db = getMemberDb();

  const { data, error } = await db.from('leads').select('status, created_at');
  const rows = (error || !data ? [] : data) as { status: string; created_at: string }[];

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const last30 = rows.filter((r) => Date.parse(r.created_at) >= thirtyDaysAgo).length;

  const won = counts.get('won') ?? 0;
  const lost = counts.get('lost') ?? 0;
  const closed = won + lost;

  const scope = seesAllLeads(member.role) ? 'the company' : 'you';

  const tiles: { label: string; value: string }[] = [
    { label: 'Leads, last 30 days', value: String(last30) },
    { label: 'New, not yet contacted', value: String(counts.get('new') ?? 0) },
    { label: 'Contacted', value: String(counts.get('contacted') ?? 0) },
    { label: 'Quoted', value: String(counts.get('quoted') ?? 0) },
    { label: 'Won', value: String(won) },
  ];
  if (closed > 0) {
    tiles.push({ label: 'Close rate', value: `${Math.round((won / closed) * 100)}%` });
  }

  return (
    <>
      <h1 className="font-display text-2xl font-extrabold uppercase">Overview</h1>
      <p className="mt-1 text-base text-rule">
        Counted for {scope} when you loaded this page. Total on record: {rows.length}.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 border border-rule bg-sheet p-4 text-base">
          No leads yet. They appear here the moment somebody finishes a quote on your site.
        </p>
      ) : (
        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          {tiles.map((t) => (
            <div key={t.label} className="border border-rule bg-sheet p-4">
              <dt className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                {t.label}
              </dt>
              <dd className="mt-1 font-data text-3xl tabular text-ink">{t.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
