import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { Panel } from '@/components/ui/Panel';
import { getPaymentProvider } from '@/lib/payments';

/**
 * /admin/billing — the money view, and specifically the UPSELL CALL SHEET.
 *
 * The "closest to cap" ordering is not a nicety: OFFER.md §3.4 defines that
 * list as the thing Dawsen works from. A contractor at 22 of 25 with 30 leads
 * captured is the easiest Operator sale in the business, because the pitch is
 * arithmetic he can already see. So the default sort is by percentage of cap,
 * descending, and the leads figure sits right next to it — never the cap
 * number alone (OFFER.md §2.1).
 *
 * Gated by the Phase 1 middleware stub; Phase 6 replaces that with real
 * Supabase Auth. No client JS: this is a server component reading through
 * the admin client, because a billing dashboard that ships an interactive
 * bundle to render a table is wasted weight.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function dollars(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

interface OverviewRow {
  prototype_id: string;
  slug: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  plan_code: string;
  subscription_id: string;
  status: string;
  provider: string;
  current_period_start: string;
  current_period_end: string;
  analyses_used: number;
  leads_captured: number;
  analysis_limit: number | null;
  cap_reached_at: string | null;
  pct_of_cap: number | null;
}

async function loadBilling() {
  try {
    const db = getSupabaseAdminClient();
    const [{ data: overview }, { data: payments }, { data: plans }] = await Promise.all([
      db.rpc('billing_overview'),
      db.from('payments').select('kind, amount_cents, status, occurred_at').order('occurred_at', { ascending: false }).limit(500),
      db.from('plans').select('code, monthly_cents'),
    ]);
    return {
      configured: true,
      rows: (overview ?? []) as unknown as OverviewRow[],
      payments: payments ?? [],
      plans: plans ?? [],
    };
  } catch {
    return { configured: false, rows: [] as OverviewRow[], payments: [], plans: [] };
  }
}

export default async function AdminBillingPage() {
  const { configured, rows, payments, plans } = await loadBilling();
  const provider = (() => {
    try {
      return getPaymentProvider().id;
    } catch {
      return 'unconfigured';
    }
  })();

  if (!configured) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <Panel label="Billing">
          <p className="text-base">
            Supabase isn&apos;t configured in this environment, so there&apos;s nothing to read yet. Set
            the Supabase env vars and reload.
          </p>
        </Panel>
      </div>
    );
  }

  const monthlyByPlan = new Map(plans.map((p) => [p.code, p.monthly_cents]));
  const activeRows = rows.filter((r) => r.status === 'active' || r.status === 'trialing');
  const mrrCents = activeRows.reduce((sum, r) => sum + (monthlyByPlan.get(r.plan_code) ?? 0), 0);
  const setupRevenueCents = payments
    .filter((p) => p.kind === 'setup' && p.status === 'succeeded')
    .reduce((sum, p) => sum + p.amount_cents, 0);
  const refundedCents = payments
    .filter((p) => p.kind === 'refund')
    .reduce((sum, p) => sum + p.amount_cents, 0);
  const needsAttention = rows.filter(
    (r) => r.status === 'past_due' || r.status === 'grace' || r.status === 'suspended'
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display font-condensed text-2xl font-bold uppercase tracking-wide">Billing</h1>
        <span className="font-data text-xs uppercase tracking-wide text-rule">provider: {provider}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'MRR', value: dollars(mrrCents), tone: 'text-ink' },
          { label: 'Active', value: String(activeRows.length), tone: 'text-ink' },
          { label: 'Setup revenue', value: dollars(setupRevenueCents), tone: 'text-ink' },
          // Refunds are stored negative, so this sums to a negative number —
          // shown as its absolute value but counted honestly against revenue.
          { label: 'Refunded', value: dollars(Math.abs(refundedCents)), tone: 'text-rule' },
        ].map((s) => (
          <div key={s.label} className="rounded-milled border bg-sheet p-3">
            <p className="font-data text-xs uppercase tracking-wide text-rule">{s.label}</p>
            <p className={'tabular mt-1 font-display font-condensed text-xl font-bold ' + s.tone}>{s.value}</p>
          </div>
        ))}
      </div>

      {needsAttention.length > 0 ? (
        <Panel label="Needs attention">
          <ul className="space-y-2">
            {needsAttention.map((r) => (
              <li key={r.subscription_id} className="flex items-baseline justify-between gap-3">
                <span className="text-base">
                  {r.business_name}{' '}
                  <span className="font-data text-xs uppercase tracking-wide text-danger">{r.status}</span>
                </span>
                <span className="font-data text-sm text-rule">{r.phone ?? r.email ?? '—'}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* THE CALL SHEET */}
      <div>
        <h2 className="font-display font-condensed text-lg font-bold uppercase tracking-wide">
          Closest to cap
        </h2>
        <p className="mt-1 font-data text-xs text-rule">
          Sorted by percentage of the monthly analysis cap. This is the upsell list.
        </p>

        {rows.length === 0 ? (
          <p className="mt-4 rounded-milled border bg-sheet p-4 text-base text-rule">
            No subscriptions yet. Once a checkout completes and the webhook lands, contractors appear here.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-left font-data text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-3 font-normal text-rule">Contractor</th>
                  <th className="py-2 pr-3 font-normal text-rule">Plan</th>
                  <th className="py-2 pr-3 font-normal text-rule">Usage</th>
                  <th className="py-2 pr-3 font-normal text-rule">Leads</th>
                  <th className="py-2 pr-3 font-normal text-rule">Renews</th>
                  <th className="py-2 font-normal text-rule">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const atCap = r.cap_reached_at !== null;
                  const hot = (r.pct_of_cap ?? 0) >= 80;
                  return (
                    <tr key={r.subscription_id} className="border-b border-rule/40">
                      <td className="py-2 pr-3">
                        <span className="block text-ink">{r.business_name}</span>
                        <span className="block text-xs text-rule">{r.phone ?? r.email ?? r.slug}</span>
                      </td>
                      <td className="py-2 pr-3 capitalize">{r.plan_code}</td>
                      <td className="tabular py-2 pr-3">
                        {r.analysis_limit === null ? (
                          <span className="text-rule">unlimited</span>
                        ) : (
                          <span className={atCap ? 'text-danger' : hot ? 'text-warning' : ''}>
                            {r.analyses_used} / {r.analysis_limit}
                            {r.pct_of_cap !== null ? (
                              <span className="ml-1 text-xs text-rule">({r.pct_of_cap}%)</span>
                            ) : null}
                          </span>
                        )}
                      </td>
                      {/* Never capped, never greyed, never a warning state. */}
                      <td className="tabular py-2 pr-3 text-ink">{r.leads_captured}</td>
                      <td className="tabular py-2 pr-3 text-rule">
                        {new Date(r.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-2">
                        <span
                          className={
                            'uppercase tracking-wide text-xs ' +
                            (r.status === 'active'
                              ? 'text-cure'
                              : r.status === 'canceled'
                                ? 'text-rule'
                                : 'text-danger')
                          }
                        >
                          {r.status}
                        </span>
                        {r.provider === 'manual' ? (
                          <span className="ml-1 text-xs text-rule">(manual)</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Panel label="Manual payments and refunds">
        <p className="text-base">
          Wires, cheques and cash are recorded through the manual provider, and refunds through the
          same table — both write the identical rows a webhook would, with{' '}
          <span className="font-data">provider=&apos;manual&apos;</span> so the audit trail shows a human did
          it. The server actions are live in{' '}
          <span className="font-data">app/actions/billing.ts</span>; the forms that call them arrive
          with the admin UI in Phase 6, which is also when real auth replaces the middleware stub
          currently gating this page.
        </p>
      </Panel>
    </div>
  );
}
