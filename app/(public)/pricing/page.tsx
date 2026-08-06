import type { Metadata } from 'next';
import { Panel } from '@/components/ui/Panel';
import { CtaButton } from '@/components/marketing/CtaButton';
import { ImplementationOffer } from '@/components/marketing/ImplementationOffer';
import { disclosureLine } from '@/lib/billing/entity';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { stubPlans } from '@/lib/stubs';

/**
 * app/(public)/pricing/page.tsx — REAL pricing, never hardcoded.
 *
 * Tiers render from the `plans` table (anon-readable for active rows,
 * 0003_rls.sql's documented deviation) via the same server client every
 * other real read in this codebase uses. If the founding rate in OFFER.md
 * §6 ever changes — the $500 setup ending at 10 contractors or October 31,
 * 2026, whichever comes first — that is a row UPDATE, and this page reflects
 * it on the next request with no deploy.
 *
 * FALLBACK: an unconfigured environment (no Supabase env set — a fresh
 * clone, a local preview) renders lib/stubs.ts's stubPlans instead of
 * throwing, so the page is always inspectable without secrets. Production
 * with real env vars always prefers the live table.
 *
 * 15A.4 — FranchiseComparison is gone from this page and from the repo. The
 * section below it is now ImplementationOffer, which carries the new
 * positioning (we implement AI in your business) and takes the identical two
 * props, so the live plan numbers still flow through untouched.
 *
 * CHECKOUT IS NOT WIRED YET, on purpose: Phase 5.5 owns the payment
 * provider adapter and is the explicit ship gate — "you cannot advertise
 * until this ships." Rather than fake a buy button or link somewhere
 * broken, both CTAs route to /demo, which is real today.
 */

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Two tiers. $500 setup, $250 a month for Foundation. 0% of your revenue, always.',
  openGraph: { title: 'Girder pricing', description: '$500 setup, $250/month. 0% of revenue.', type: 'website' },
};

interface PlanView {
  code: string;
  name: string;
  setupFeeCents: number;
  monthlyCents: number;
  analysisLimitPerMonth: number | null;
  features: Record<string, boolean>;
}

async function loadPlans(): Promise<{ plans: PlanView[]; live: boolean }> {
  try {
    const db = createSupabaseServerClient();
    const { data, error } = await db
      .from('plans')
      .select('code, name, setup_fee_cents, monthly_cents, analysis_limit_per_month, features')
      .eq('is_active', true)
      .order('setup_fee_cents', { ascending: true });
    if (error || !data || data.length === 0) throw error ?? new Error('empty');
    return {
      live: true,
      plans: data.map((p) => ({
        code: p.code,
        name: p.name,
        setupFeeCents: p.setup_fee_cents,
        monthlyCents: p.monthly_cents,
        analysisLimitPerMonth: p.analysis_limit_per_month,
        features: (p.features ?? {}) as Record<string, boolean>,
      })),
    };
  } catch {
    return {
      live: false,
      plans: stubPlans
        .slice()
        .sort((a, b) => a.setupFeeCents - b.setupFeeCents)
        .map((p) => ({
          code: p.code,
          name: p.name,
          setupFeeCents: p.setupFeeCents,
          monthlyCents: p.monthlyCents,
          analysisLimitPerMonth: p.analysisLimitPerMonth,
          features: p.features,
        })),
    };
  }
}

function dollars(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

const FEATURE_LABELS: { key: string; label: string }[] = [
  { key: 'quote.ai_analysis', label: 'AI photo analysis' },
  { key: 'lead.capture', label: 'Unlimited lead capture' },
  { key: 'quote.share_page', label: 'Shareable quote pages' },
  { key: 'brand.style_toggle', label: 'Light / Dark Industrial' },
  { key: 'cure.advisor', label: 'Cure-risk advisor' },
  { key: 'command_center', label: 'Internal command center' },
  { key: 'ai.implementation_review', label: 'AI implementation review' },
];

export default async function PricingPage() {
  const { plans } = await loadPlans();
  const foundation = plans.find((p) => p.code === 'foundation');

  return (
    <div className="pb-16">
      {/* R-210: the disclosure is above the fold, plain body size, from config. */}
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <Panel label="Billing entity">
          <p className="text-base">{disclosureLine()}</p>
        </Panel>
      </div>

      <div className="mx-auto max-w-3xl px-4 pt-10 text-center">
        <p className="font-data text-xs uppercase tracking-wide text-hazard">Founding rate — first 10 in DFW, or Oct 31, 2026</p>
        <h1 className="mt-2 font-display font-condensed text-3xl font-bold sm:text-4xl">
          {foundation ? dollars(foundation.setupFeeCents) : '$500'} to set up. 0% of your revenue. Ever.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-rule">
          I&apos;m taking ten contractors in DFW at {foundation ? dollars(foundation.setupFeeCents) : '$500'} because I want
          ten sites running in one metro that I can point at. After that it&apos;s $1,500 setup — the monthly stays $250
          either way, and it never changes for customers already in.
        </p>
      </div>

      <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-6 px-4 sm:grid-cols-2">
        {plans.map((p) => (
          <div key={p.code} className="rounded-milled border bg-sheet p-6">
            <p className="font-data text-xs uppercase tracking-wide text-rule">{p.name}</p>
            <p className="tabular mt-2 font-display font-condensed text-4xl font-bold">
              {dollars(p.setupFeeCents)}
              <span className="text-lg font-normal text-rule"> setup</span>
            </p>
            <p className="tabular font-display font-condensed text-xl font-bold text-rule">
              + {dollars(p.monthlyCents)}<span className="text-sm font-normal"> / month</span>
            </p>
            <p className="mt-3 font-data text-sm">
              {p.analysisLimitPerMonth === null
                ? 'Unlimited AI photo analyses'
                : p.analysisLimitPerMonth + ' AI photo analyses / month'}
            </p>
            <ul className="mt-4 space-y-1.5">
              {FEATURE_LABELS.map((f) => {
                const on = p.features[f.key] === true;
                return (
                  <li key={f.key} className={'font-data text-sm ' + (on ? 'text-ink' : 'text-rule line-through')}>
                    {on ? '✓ ' : '— '}
                    {f.label}
                  </li>
                );
              })}
            </ul>
            <div className="mt-6">
              <CtaButton href="/demo" variant={p.code === 'foundation' ? 'hazard' : 'outline'}>
                Try it live
              </CtaButton>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-16">
        <ImplementationOffer
          foundationSetupDollars={foundation ? Math.round(foundation.setupFeeCents / 100) : 500}
          foundationMonthlyDollars={foundation ? Math.round(foundation.monthlyCents / 100) : 250}
        />
      </div>

      <div className="mx-auto max-w-2xl px-4">
        <Panel label="30-day guarantee">
          <p className="font-display font-condensed text-lg font-bold">
            Thirty days. If it&apos;s not working, you get the setup fee back.
          </p>
          <p className="mt-2 text-base leading-relaxed">
            Tell me inside 30 days and I refund the {foundation ? dollars(foundation.setupFeeCents) : '$500'} setup in
            full, no questions and no forms. You keep any leads it captured. I don&apos;t refund monthly fees for months
            already used, and I won&apos;t promise you a number of leads — this converts the traffic you already have, it
            doesn&apos;t create traffic. If it doesn&apos;t convert it, you shouldn&apos;t be paying for it.
          </p>
        </Panel>
      </div>
    </div>
  );
}
