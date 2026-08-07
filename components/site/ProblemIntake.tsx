import { RequestForm } from '@/components/site/RequestForm';

/**
 * components/site/ProblemIntake.tsx — the homepage's open question.
 *
 * ============================================================================
 * WHAT THIS IS FOR
 * ============================================================================
 *
 * Nineteen tools are specified and one is running. The overwhelming majority of
 * visitors do a trade this site does not yet serve, and the honest thing to do
 * with them is not to show them a queue and hope — it is to ask what is
 * actually broken in their business.
 *
 * That answer is worth more than a vote. A vote says "roofing"; this says "I
 * spend four hours a month retyping measurements into three places", which is a
 * thing that can be built and priced.
 *
 * ============================================================================
 * THE HEADING IS THE READER'S SENTENCE, NOT OURS
 * ============================================================================
 *
 * It says something is slow or costs too much, because that is how a contractor
 * describes his own problem to himself. He does not think "I require a bespoke
 * software solution". Every word here is one he would use.
 *
 * NOTHING IS PROMISED. It does not say we will build it, or how fast, or for
 * how much. One person building from a phone cannot hold a turnaround promise,
 * and the concierge section already learned that lesson — a missed promise to
 * this audience is fatal in a way an admitted limitation is not.
 *
 * Server component; the form inside it is the only client boundary.
 */

export function ProblemIntake() {
  return (
    <section className="n15-sec" aria-labelledby="problem-h">
      <div className="n15-in">
        <p className="n15-eyebrow">Tell us what is broken</p>
        <h2 id="problem-h" className="n15-h2">
          Something in your business is slow, or costs too much. See if we can
          build something for it.
        </h2>
        <p className="n15-lede">
          The estimate you rebuild from scratch every time. The measurements you
          retype into three places. The quote that takes two evenings. Describe
          it in your own words and we will tell you honestly whether it is worth
          building software for — including when it is not.
        </p>

        <div className="rf-wrap">
          <RequestForm kind="custom_build" source="home_custom" />
        </div>
      </div>
    </section>
  );
}
