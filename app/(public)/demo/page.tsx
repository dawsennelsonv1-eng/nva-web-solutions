import { Placeholder } from '@/components/ui/Placeholder';

export default function DemoPage() {
  return (
    <Placeholder
      name="Route: /demo (widget in 'live' mode — Phase 5)"
      props={{ mode: 'live', note: 'mode is ALWAYS an explicit prop (R-123)' }}
    />
  );
}
