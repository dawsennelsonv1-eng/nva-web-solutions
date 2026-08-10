import Link from 'next/link';

/**
 * components/member/LockedPanel.tsx — what an unpaid account sees where a paid
 * screen would be.
 *
 * NOT A 404, AND NOT A REDIRECT. A 404 tells a real person their account is
 * broken and sends them to support; a redirect drops them somewhere else with
 * no explanation of why. Both make the contractor's problem harder to name.
 * The route keeps its URL and says plainly what is here and what turns it on.
 *
 * This is copy, not the security boundary. 0014's policies are — an unpaid
 * company's leads query returns its own rows and nobody else's whether this
 * panel renders or not. Nothing sensitive is being withheld here; a product he
 * has not bought yet is.
 *
 * NO PRICES IN THIS FILE. They live on /pricing and they change (the setup fee
 * is currently a season price). A number duplicated here would go stale
 * silently and quote a contractor a figure the checkout does not honour.
 */
export function LockedPanel({
  title,
  blurb,
}: {
  title: string;
  /** One sentence naming what this screen does once it is on. */
  blurb: string;
}) {
  return (
    <>
      <p className="n15-eyebrow">Not yet</p>
      <h1 className="mb-h">{title}</h1>
      <p className="mb-lede">Not switched on for this account.</p>

      <div className="mb-panel">
        <p className="mb-panel-b">{blurb}</p>
        <p className="mb-panel-b">
          It unlocks as soon as this account is on a plan. Your sign-in, your company and
          anything already saved stay exactly as they are.
        </p>
        <div className="mb-actions">
          <Link href="/pricing" className="n15-btn n15-btn-primary">
            See the plans
          </Link>
          <Link href="/start" className="n15-btn n15-btn-ghost">
            Talk to us first
          </Link>
        </div>
      </div>
    </>
  );
}
