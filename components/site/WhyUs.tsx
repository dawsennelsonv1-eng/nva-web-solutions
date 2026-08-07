/**
 * components/site/WhyUs.tsx — directly under the hero. PHASE 16A.
 *
 * ============================================================================
 * SIX POINTS BECAME THREE, AND NOTHING WAS THROWN AWAY
 * ============================================================================
 *
 * The 15B version listed six: lives on your site, no code, looks like yours,
 * built for a phone, you keep your revenue, capture never stops. Six items in a
 * row is a specification sheet, and a reader scanning on a phone treats a
 * six-item grid the way he treats a wall of bullets — he reads the first two
 * and scrolls. Three is the number a person actually holds.
 *
 * Every one of the six survives, folded into the point it belongs to:
 *
 *   "It runs on your own site"  <- lives on your site + no code + looks like yours
 *   "Built for the phone"       <- built for a phone + capture never stops
 *   "You keep what you invoice" <- keep your revenue + no contract
 *
 * ============================================================================
 * GENERIC IN SCOPE, SPECIFIC IN TEXTURE
 * ============================================================================
 *
 * This page is becoming the front of a marketplace of tools for many trades, so
 * nothing here says epoxy, coating, or square feet — those belong on a product
 * page now, not on the front door. But the examples are chosen so a floor
 * contractor still recognises his own week in them: the customer wanting a
 * number at night, the phone in the truck, the invoice that stays whole.
 *
 * That is the only way one page speaks to nineteen trades without going bland.
 *
 * NO ICONS, unchanged from 15B and for the same reason: every point here is an
 * abstraction, and there is no drawing of "you keep what you invoice" that
 * carries information.
 *
 * Server component. No client JavaScript ships for this section.
 */

const POINTS = [
  {
    head: 'It runs on your own site',
    body: 'Not another app to log into. It sits on the page your customers already land on, under your domain, in your colours and your logo. Installing it is pasting one line — and if somebody else built your site, we will do that part for you.',
  },
  {
    head: 'Built for the phone, and the person holding it',
    body: 'Most people pricing a job are doing it one-handed, at night, on mobile data. That is the case it is designed for, not the one it falls back to. And every enquiry reaches you whatever else happens, because lead capture runs on a path of its own.',
  },
  {
    head: 'You keep everything you invoice',
    body: 'A setup fee and a monthly fee. No share of a job, no commission on a lead, no percentage of anything, for as long as you stay. No contract either — you cancel in one click and your leads keep arriving.',
  },
];

export function WhyUs() {
  return (
    <section className="n15-sec" aria-labelledby="why-h">
      <div className="n15-in">
        <p className="n15-eyebrow">Why us</p>
        <h2 id="why-h" className="n15-h2">
          The work happens on your site, and the money stays yours.
        </h2>

        <div className="wu-grid">
          {POINTS.map((p) => (
            <div key={p.head} className="wu-item">
              <h3>{p.head}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
