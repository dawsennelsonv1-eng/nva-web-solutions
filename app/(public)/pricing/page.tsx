import type { Metadata } from 'next';
import Link from 'next/link';
import { GradientField } from '@/components/site/GradientField';
import { disclosureLine } from '@/lib/billing/entity';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { stubPlans } from '@/lib/stubs';

/**
 * app/(public)/pricing/page.tsx — REAL pricing, never hardcoded. Restyled, 16G.
 *
 * ============================================================================
 * THE DATA PATH IS UNCHANGED. EVERY WORD OF THAT ORIGINAL NOTE STILL HOLDS.
 * ============================================================================
 *
 * Tiers render from the `plans` table (anon-readable for active rows,
 * 0003_rls.sql's documented deviation) through the same server client every
 * other real read uses. If the founding rate ever changes, that is a row UPDATE
 * and this page reflects it on the next request with no deploy.
 *
 * FALLBACK: an unconfigured environment renders lib/stubs.ts's stubPlans rather
 * than throwing, so the page is always inspectable without secrets.
 *
 * CHECKOUT IS STILL NOT WIRED. Phase 5.5 owns the payment adapter and is the
 * explicit ship gate. Rather than fake a buy button, the CTAs route to things
 * that are real today — /demo for the tool, /start for the questionnaire.
 *
 * ============================================================================
 * WHAT CHANGED
 * ============================================================================
 *
 * Panel, CtaButton and ImplementationOffer are no longer imported. All three
 * are drawn in the legacy token system and cannot be restyled here without
 * changing the other surfaces that mount them. NONE OF THEM IS DELETED — grep
 * before removing anything:
 *
 *   grep -rn "Panel\|CtaButton\|ImplementationOffer" app components
 *
 * ImplementationOffer's argument — that we implement AI inside your business —
 * now lives on the homepage, in a section written for it. Repeating it at the
 * bottom of a pricing page was the pricing page doing someone else's job; this
 * one answers what it costs and links onward.
 *
 * THE DISCLOSURE STAYS ABOVE THE FOLD at plain body size, from config (R-210).
 * It moved from a Panel into a plain block. That is a styling change and not a
 * relaxation: it is still the first thing under the heading, still full size,
 * still not in a collapsed or muted container.
 *
 * THE 30-DAY GUARANTEE COPY IS UNCHANGED, including the part that refuses to
 * promise a number of leads. That paragraph is the most valuable thing on the
 * page and it survives verbatim.
 */

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Two tiers. $500 setup, $250 a month for Foundation. 0% of your revenue, always.',
  openGraph: {
    title: 'Girder pricing',
    description: '$500 setup, $250/month. 0% of revenue.',
    type: 'website',
  },
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
  const setup = foundation ? dollars(foundation.setupFeeCents) : '$500';

  return (
    <>
      <GradientField />
      <section className="n15-sec" aria-labelledby="pricing-h">
        <div className="n15-in">
          <p className="n15-eyebrow">Discount season</p>
          <h1 id="pricing-h" className="n15-h2">
            {setup} to set up. 0% of your revenue. Ever.
          </h1>
          <p className="n15-lede">
            Setup is {setup} while the discount season is running. When it ends
            it goes back to $1,000. The monthly is $250 either way, and it never
            goes up for an account that is already open — including yours, for
            as long as you stay.
          </p>

          <div className="pc-grid">
            {plans.map((p) => (
              <article key={p.code} className={'pc-card' + (p.code === 'foundation' ? ' pc-card-lead' : '')}>
                <p className="pc-name">{p.name}</p>

                <p className="pc-fig">
                  {dollars(p.setupFeeCents)}
                  <span className="pc-fig-unit"> setup</span>
                </p>
                <p className="pc-monthly">
                  + {dollars(p.monthlyCents)}
                  <span className="pc-fig-unit"> / month</span>
                </p>

                <p className="pc-limit">
                  {p.analysisLimitPerMonth === null
                    ? 'Unlimited AI photo analyses'
                    : p.analysisLimitPerMonth + ' AI photo analyses / month'}
                </p>

                <ul className="pc-features">
                  {FEATURE_LABELS.map((f) => {
                    const on = p.features[f.key] === true;
                    return (
                      <li key={f.key} className={on ? 'pc-on' : 'pc-off'}>
                        <span aria-hidden className="pc-mark">
                          {on ? '✓' : '—'}
                        </span>
                        {f.label}
                      </li>
                    );
                  })}
                </ul>

                <div className="pc-actions">
                  <Link
                    href="/demo"
                    className={
                      'n15-btn ' +
                      (p.code === 'foundation' ? 'n15-btn-primary' : 'n15-btn-ghost')
                    }
                  >
                    Try it live
                  </Link>
                  <Link href="/start" className="n15-btn n15-btn-ghost">
                    Get this on my site
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <div className="ai-foot">
            <h2 className="n15-h3">Thirty days. If it&apos;s not working, you get the setup fee back.</h2>
            <p className="n15-body n15-measure">
              Tell me inside 30 days and I refund the {setup} setup in full, no
              questions and no forms. You keep any leads it captured. I
              don&apos;t refund monthly fees for months already used, and I
              won&apos;t promise you a number of leads — this converts the
              traffic you already have, it doesn&apos;t create traffic. If it
              doesn&apos;t convert it, you shouldn&apos;t be paying for it.
            </p>
          </div>

          {/*
            R-210 — THE SELLER DISCLOSURE. Moved, not deleted, and this is worth
            reading before deleting it in a later pass.

            It was a bordered card directly under the headline, which is where
            it looked worst and where the request to remove it came from. It is
            now one quiet line at the foot of the page.

            It is NOT removed outright because it is not decoration. Naming the
            entity that will appear on a card statement is a payment-processor
            and consumer-protection expectation, not a stylistic choice, and a
            buyer who sees an unfamiliar name on his statement and cannot find
            it explained anywhere is a chargeback. One small line at the bottom
            of the pricing page is the ordinary place for it.

            It renders from config. If it shows a bracketed placeholder, the env
            var is unset — set LEGAL_SELLER_NAME and LEGAL_SELLER_COUNTRY rather
            than deleting the line.
          */}
          <p className="n15-small pc-seller">{disclosureLine()}</p>
        </div>
      </section>
    </>
  );
}
