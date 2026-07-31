import { Placeholder } from '@/components/ui/Placeholder';
import { Panel } from '@/components/ui/Panel';
import { disclosureLine } from '@/lib/billing/entity';
import { stubPlans } from '@/lib/stubs';

export default function PricingPage() {
  return (
    <>
      {/* R-210: the disclosure is above the fold, body size, from config. */}
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <Panel label="Billing entity">
          <p className="text-base">{disclosureLine()}</p>
        </Panel>
      </div>
      <Placeholder
        name="Route: /pricing (tiers read from plans table — R-209; stubbed until Phase 6)"
        props={{
          plans: stubPlans.map((p) => ({
            code: p.code,
            setupFeeCents: p.setupFeeCents,
            monthlyCents: p.monthlyCents,
            analysisLimitPerMonth: p.analysisLimitPerMonth,
          })),
        }}
      />
    </>
  );
}
