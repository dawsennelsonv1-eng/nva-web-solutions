import Link from 'next/link';
import { requireMember, seesAllLeads } from '@/lib/auth/member';
import { getMemberDb } from '@/lib/companies/db';
import { resolveCompanyAccess, hasFullAccess } from '@/lib/entitlements/company';

export const dynamic = 'force-dynamic';

/**
 * /app — the overview, or the way in.
 *
 * TWO SCREENS, ONE ROUTE. An account with a subscription gets its numbers. An
 * account without one gets the only thing that is actually true for it: it has
 * a sign-in, it has no product yet, and here is where the product is. It is
 * not an error page and it does not read like one.
 *
 * WHY THE UNPAID SCREEN DOES NOT LIST THE TOOLS INLINE. The catalogue is
 * reconciled against the vertical registry by getQueueSections() so the site
 * is structurally incapable of claiming a tool works when its module is not
 * registered. Re-listing tools here from a second source would be a second
 * source of truth and would eventually disagree with the first. /demo IS that
 * list, it is already honest, and this links to it.
 * VERIFY: if you would rather the directory render inside /app, that is a real
 * option — it means importing getQueueSections here, not hardcoding names.
 *
 * EVERY NUMBER BELOW IS COUNTED THROUGH RLS. There is not one company filter in
 * the queries, and there does not need to be: the policies in 0014 mean a
 * member's `select count(*) from leads` already answers for his company only,
 * and a crew member's answers for his own assigned leads only. A forgotten
 * filter returns too little, never too much — which is the direction a tenancy
 * mistake should fail in.
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

  const access = await resolveCompanyAccess(member.companyId);

  if (!hasFullAccess(access)) {
    return (
      <>
        <p className="n15-eyebrow">Your account</p>
        <h1 className="mb-h">{member.companyName}</h1>
        <p className="mb-lede">
          Your account is set up. There is no plan on it yet, so there is nothing to
          measure — this fills in the moment quotes start arriving.
        </p>

        <div className="mb-panel">
          <h2 className="mb-panel-h">What you get</h2>
          <p className="mb-panel-b">
            A quoting tool on your own site. Your customer photographs the floor, the
            price comes from your rate table, and the lead reaches you whether or not
            they book.
          </p>
          <p className="mb-panel-b">
            Overview, Leads and Team switch on with the subscription.
          </p>
          <div className="mb-actions">
            <Link href="/pricing" className="n15-btn n15-btn-primary">
              See the plans
            </Link>
            <Link href="/demo" className="n15-btn n15-btn-ghost">
              Look at the tools
            </Link>
          </div>
        </div>

        <p className="mb-lede">
          Already paid and still seeing this? Reply to your receipt — it means the
          subscription has not been attached to this company yet, and that is ours to
          fix, not yours.
        </p>
      </>
    );
  }

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

  const newCount = counts.get('new') ?? 0;

  const tiles: { label: string; value: string; lead?: boolean }[] = [
    { label: 'New, not yet contacted', value: String(newCount), lead: true },
    { label: 'Leads, last 30 days', value: String(last30) },
    { label: 'Contacted', value: String(counts.get('contacted') ?? 0) },
    { label: 'Quoted', value: String(counts.get('quoted') ?? 0) },
    { label: 'Won', value: String(won) },
  ];
  if (closed > 0) {
    tiles.push({ label: 'Close rate', value: `${Math.round((won / closed) * 100)}%` });
  }

  return (
    <>
      <p className="n15-eyebrow">Overview</p>
      <h1 className="mb-h">{member.companyName}</h1>
      <p className="mb-lede">
        Counted for {scope} when you loaded this page. {rows.length} on record.
      </p>

      {rows.length === 0 ? (
        <div className="mb-panel">
          <h2 className="mb-panel-h">Nothing has come in yet</h2>
          <p className="mb-panel-b">
            Leads appear here the moment somebody finishes a quote on your site — their
            name, their number, the size of the floor and the range they were shown.
          </p>
        </div>
      ) : (
        <>
          {/* NEW LEADS LEAD, and the tile is marked. It is the only figure on
              this screen that asks the contractor to do something today; the
              rest are history. Ordering by importance rather than by
              chronology is the difference between a dashboard and a report. */}
          <dl className="mb-tiles">
            {tiles.map((t) => (
              <div
                key={t.label}
                className={'mb-tile' + (t.lead ? ' mb-tile-lead' : '')}
              >
                <dt>{t.label}</dt>
                <dd>{t.value}</dd>
              </div>
            ))}
          </dl>

          {newCount > 0 && (
            <div className="mb-panel">
              <h2 className="mb-panel-h">
                {newCount} {newCount === 1 ? 'person is' : 'people are'} waiting on a call
              </h2>
              <p className="mb-panel-b">
                They already have a price. The call is to confirm the concrete and book
                a date.
              </p>
              <div className="mb-actions">
                <Link href="/app/leads" className="n15-btn n15-btn-primary">
                  Open the pipeline
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
