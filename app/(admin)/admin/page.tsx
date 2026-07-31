import Link from 'next/link';
import { getDashboardDataAction } from '@/app/actions/dashboard';

/**
 * /admin dashboard — replacing the Phase 1 stub. "Make the drop-off point
 * and the upsell list obvious at a glance" drives every layout choice here:
 * the funnel is a horizontal bar chart (drop-off reads as a shrinking bar,
 * no chart library needed — divs at percentage widths), and closest-to-cap
 * is the first thing below the fold, not buried behind a click into billing.
 */
export const dynamic = 'force-dynamic';

function dollars(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

export default async function AdminDashboardPage() {
  const data = await getDashboardDataAction();

  if (!data.configured) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <p className="rounded-milled border bg-sheet p-4 text-base text-rule">
          Supabase isn&apos;t configured in this environment, so there&apos;s nothing to show yet.
        </p>
      </div>
    );
  }

  const funnelMax = Math.max(1, ...data.funnel.map((f) => f.count));

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Leads today" value={String(data.todaysLeadCount)} />
        <Stat label="MRR" value={dollars(data.mrrCents)} sub={data.activeSubscriptions + ' active'} />
      </div>

      <div>
        <h2 className="font-display font-condensed text-lg font-bold uppercase tracking-wide">
          Widget funnel, last 7 days
        </h2>
        {data.funnel.every((f) => f.count === 0) ? (
          <p className="mt-2 font-data text-sm text-rule">No widget activity yet in this window.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {data.funnel.map((f, i) => {
              const prev = i > 0 ? data.funnel[i - 1]?.count ?? 0 : f.count;
              const dropPct = prev > 0 ? Math.round(((prev - f.count) / prev) * 100) : 0;
              return (
                <div key={f.step}>
                  <div className="flex items-baseline justify-between font-data text-xs">
                    <span className="capitalize text-rule">{f.step}. {f.stepName}</span>
                    <span className="tabular text-ink">
                      {f.count}
                      {i > 0 && dropPct > 0 ? <span className="ml-1 text-danger">−{dropPct}%</span> : null}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-rule/20">
                    <div
                      className="h-2 rounded-full bg-hazard"
                      style={{ width: Math.max(4, (f.count / funnelMax) * 100) + '%' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {data.abandonment.length > 0 ? (
        <div>
          <h2 className="font-display font-condensed text-lg font-bold uppercase tracking-wide">
            Where people leave
          </h2>
          <ul className="mt-2 space-y-1">
            {data.abandonment.map((a) => (
              <li key={a.step} className="flex justify-between font-data text-sm">
                <span className="capitalize text-rule">{a.step}</span>
                <span className="tabular text-ink">{a.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display font-condensed text-lg font-bold uppercase tracking-wide">
            Closest to cap
          </h2>
          <Link href="/admin/billing" className="font-data text-xs text-rule hover:text-ink">
            All billing →
          </Link>
        </div>
        {data.closestToCap.length === 0 ? (
          <p className="mt-2 font-data text-sm text-rule">Nobody is near their cap right now.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.closestToCap.map((c) => (
              <li key={c.prototypeId} className="rounded-milled border bg-sheet p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-base text-ink">{c.businessName}</span>
                  <span className="tabular font-data text-sm text-warning">{c.pctOfCap}%</span>
                </div>
                <p className="tabular font-data text-xs text-rule">
                  {c.analysesUsed} / {c.analysisLimit} analyses · {c.leadsCaptured} leads captured
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-milled border bg-sheet p-3">
      <p className="font-data text-xs uppercase tracking-wide text-rule">{label}</p>
      <p className="tabular mt-1 font-display font-condensed text-2xl font-bold">{value}</p>
      {sub ? <p className="font-data text-xs text-rule">{sub}</p> : null}
    </div>
  );
}
