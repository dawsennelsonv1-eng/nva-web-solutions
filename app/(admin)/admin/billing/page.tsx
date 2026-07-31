import { Placeholder } from '@/components/ui/Placeholder';
import { stubPlans } from '@/lib/stubs';

export default function AdminBillingPage() {
  return (
    <Placeholder
      name="Route: /admin/billing (Phase 5.5 — closest-to-cap is the upsell call sheet)"
      props={{ plans: stubPlans.map((p) => p.code) }}
    />
  );
}
