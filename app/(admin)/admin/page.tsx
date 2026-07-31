import { Placeholder } from '@/components/ui/Placeholder';
import { stubUsage } from '@/lib/stubs';

export default function AdminDashboardPage() {
  return (
    <Placeholder
      name="Route: /admin (dashboard — Phase 6)"
      props={{
        usageDisplayRule: 'always BOTH numbers (OFFER.md 2.1)',
        example: `${stubUsage.analysesUsed} analyses used · ${stubUsage.leadsCaptured} leads captured`,
      }}
    />
  );
}
