import { Placeholder } from '@/components/ui/Placeholder';

export default function QuotePage({ params }: { params: { quoteId: string } }) {
  return (
    <Placeholder
      name="Route: /q/[quoteId] (persistent shareable quote — Phase 4)"
      props={{ quoteId: params.quoteId }}
    />
  );
}
