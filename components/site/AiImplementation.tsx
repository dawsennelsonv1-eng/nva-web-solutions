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
 * THE CLOSING BLOCK IS GONE — PHASE 16A
 * ============================================================================
 *
 * 15B ended this section with a "We look at the business first" card and two
 * buttons. It is removed. The audit it described is real, but it was making
 * this section carry a second job — positioning AND conversion — and the page
 * now has a dedicated intake further down that asks for the same information in
 * a form instead of describing it in a paragraph. A section that explains what
 * a conversation would cover, immediately above a form that starts one, is the
 * paragraph losing.
 *
 * ORIGINAL ENTRY-POINT NOTE, still true of the buttons elsewhere on the page:
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
    head: 'An instant answer on your own website',
    body: 'Somebody lands on your site at nine at night wanting a number. Right now they find a contact form and call the next company on the list. This gives them a real range in under a minute, from your rates, and hands you their name and phone whether or not they book.',
  },
  {
    head: 'They see the finished job before they call',
    body: 'The question you answer every week is what will it actually look like. Describing it loses the job to whoever showed a picture. They send a photo of their own place and get it back finished — their room, their light, not a gallery of somebody else’s work.',
  },
  {
    head: 'Software built for how you actually work',
    body: 'The estimate you rebuild in a spreadsheet every time. The measurements you retype into three places. The follow-up you meant to send on Tuesday. Those are the jobs worth writing software for, and they are different in every trade — which is why we build yours rather than selling you somebody else’s.',
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
          work actually gets won in your company — where the enquiries come in,
          how long an answer takes, where the ones you lose drop out — and we
          build the specific thing that is missing.
        </p>

        <div className="ai-grid">
          {OFFERS.map((o) => (
            <div key={o.head} className="ai-card">
              <h3>{o.head}</h3>
              <p>{o.body}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
