import { Placeholder } from '@/components/ui/Placeholder';
import { TickStrip } from '@/components/ui/Tick';
import { getRegisteredVerticals } from '@/lib/verticals/manifest';

export default function PublicHubPage() {
  const verticals = getRegisteredVerticals().map((v) => v.id);
  return (
    <>
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <TickStrip count={32} />
      </div>
      <Placeholder
        name="Route: / (public hub — Phase 5 makes the widget the hero)"
        props={{ registeredVerticals: verticals }}
      />
    </>
  );
}
