import { Placeholder } from '@/components/ui/Placeholder';
import { stubLeads } from '@/lib/stubs';

export default function LeadsPage() {
  return (
    <Placeholder
      name="Route: /admin/leads (Phase 6 — degraded leads visually distinct, R-506)"
      props={{ leads: stubLeads }}
    />
  );
}
