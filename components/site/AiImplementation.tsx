import Link from 'next/link';

/**
 * components/site/AiImplementation.tsx — THE POSITIONING.
 *
 * The franchise angle is gone. This is what replaces it: we implement AI
 * inside your business.
 *
 * ============================================================================
 * WRITTEN FROM HIS SIDE OF THE SCREEN
 * ============================================================================
 *
 * The instruction was that a contractor should read this and think of a
 * specific problem he has, not a category of software. So every paragraph
 * below names a moment in his week rather than a capability: the estimate he
 * has not written at nine at night, the woman who asked what it will look like
 * and got a paragraph of description, the four hours a month he spends
 * retyping the same numbers.
 *
 * Nothing here says transform, leverage, empower, unlock, seamless,
 * revolutionise, or powered by AI.
 *
 * ============================================================================
 * THE ENTRY POINT ROUTES INTO WHAT ALREADY EXISTS
 * ============================================================================
 *
 * /pricing is the existing entry to the funnel, and its own CTA
 * (components/prototype/PurchaseCta) already runs the checkout path. This
 * section links there rather than mounting a second capture form. There is
 * exactly one lead path on this site and this does not add one.
 *
 * VERIFY: there is no dedicated "book an audit" route in the repo as pasted.
 * The audit card therefore routes to the same place as everything else and the
 * copy is written to be true of that destination — it says get in touch, not
 * "book a slot", because a booking calendar does not exist and a button that
 * implies one would be the same kind of overstatement this page is otherwise
 * careful to avoid. If you add a route later, this is the one link to change.
 *
 * Server component. No client JavaScript.
 */

const OFFERS = [
  {
    head: 'A quoting tool on your own website',
    body: 'Somebody lands on your site at nine at night wanting a number. Right now they find a contact form and call the next company on the list. This gives them a real range in under a minute, from your rates, and hands you their name and phone whether or not they book.',
  },
  {
    head: 'A visualiser that shows them the floor',
    body: 'The question you answer every week is what will it actually look like. Describing it loses the job to whoever showed a picture. They send a photo of their own garage and get it back with the coating on it — their room, their light, not a gallery of somebody else’s work.',
  },
  {
    head: 'Software built for how you work',
    body: 'The estimate you rebuild in a spreadsheet every time. The measurements you retype into three places. The follow-up you meant to send on Tuesday. Those are the jobs worth writing software for, and they are different in every trade.',
  },
];

export function AiImplementation() {
  return (
    <section className="n15-sec" aria-labelledby="ai-h">
      <div className="n15-in">
        <p className="n15-eyebrow">What we actually do</p>
        <h2 id="ai-h" className="n15-h2">
          We put AI inside your business, then build what it turns out you need.
        </h2>
        <p className="n15-lede">
          Not a website. Not a monthly retainer for marketing. We look at how
          quotes actually get made in your company, and we build the specific
          thing that is missing.
        </p>

        <div className="ai-grid">
          {OFFERS.map((o) => (
            <div key={o.head} className="ai-card">
              <h3>{o.head}</h3>
              <p>{o.body}</p>
            </div>
          ))}
        </div>

        <div className="ai-foot">
          <h3 className="n15-h3">We look at the business first</h3>
          <p className="n15-body n15-measure">
            Before anything gets built we go through how a job goes from enquiry
            to signed: where the enquiries come in, who answers them, how long a
            quote takes to write, what gets it wrong, and where the ones you lose
            drop out. Most of what comes back is not software — it is a step that
            should not exist. What is left is the thing worth building, and you
            get that list whether or not you hire us for the build.
          </p>
          <p className="n15-small n15-measure">
            What none of this does is create traffic. It converts the people
            already looking at you.
          </p>

          <div className="tc-actions n15-actions-wide">
            <Link href="/pricing" className="n15-btn n15-btn-primary">
              Start with my trade
            </Link>
            <Link href="/demo" className="n15-btn n15-btn-ghost">
              Run the whole thing first
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
