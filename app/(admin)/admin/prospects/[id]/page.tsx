import { Placeholder } from '@/components/ui/Placeholder';

export default function ProspectDetailPage({ params }: { params: { id: string } }) {
  return (
    <Placeholder
      name="Route: /admin/prospects/[id] (Phase 6)"
      props={{ id: params.id }}
    />
  );
}
