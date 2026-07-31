import { Placeholder } from '@/components/ui/Placeholder';

export default function CheckoutReturnPage() {
  return (
    <Placeholder
      name="Route: /checkout/return (pending-until-webhook — Phase 5.5)"
      props={{ rule: 'This page NEVER grants access itself (R-606)' }}
    />
  );
}
