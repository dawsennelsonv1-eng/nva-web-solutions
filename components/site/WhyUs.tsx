/**
 * components/site/WhyUs.tsx — directly under the hero.
 *
 * NO ICONS, and that is a decision rather than an omission. Every point here
 * is an abstraction — ownership, continuity, the absence of a revenue share —
 * and there is no drawing of "you keep 100% of your revenue" that carries
 * information. An icon for an abstraction is decoration wearing the costume of
 * a diagram. Type and space do the work instead, at a scale that assumes the
 * reader is standing on a job site holding a phone.
 *
 * Server component. No client JavaScript ships for this section.
 *
 * THE HAIRLINE ABOVE EACH ITEM is the one structural device kept from the old
 * system, and it is kept because it is doing something: it groups, at three
 * columns on a desktop and one on a phone, without boxing six short paragraphs
 * into six cards that would compete with the tool cards below. The cards are
 * the loud thing on this page. This section is deliberately quiet.
 */

const POINTS = [
  {
    head: 'It lives on your site',
    body: 'Not another app you log into and forget. It sits on the page your customers already land on, under your domain, next to your phone number.',
  },
  {
    head: 'No code, one line',
    body: 'You paste a single line where you want it. If somebody else built your site, send them the line — or send it to us and we will do it and show you the confirmation.',
  },
  {
    head: 'It looks like yours',
    body: 'Your logo, your colours, your wording. We build the branded version first and send you a link to the working thing before you pay for anything.',
  },
  {
    head: 'Built for a phone',
    body: 'Most of the people pricing a job are doing it one-handed, at night, on mobile data. That is the case it is designed for, not the one it degrades to.',
  },
  {
    head: 'You keep everything you invoice',
    body: 'A setup fee and a monthly fee. No share of a job, no commission on a lead, no percentage of anything, for as long as you stay.',
  },
  {
    head: 'The lead capture never stops',
    body: 'Payment lapse, usage cap, API outage — the widget falls back to a plain contact form and the enquiry still reaches you. That is how it is built, not a promise about how we will behave.',
  },
];

export function WhyUs() {
  return (
    <section className="n15-sec" aria-labelledby="why-h">
      <div className="n15-in">
        <p className="n15-eyebrow">Why us</p>
        <h2 id="why-h" className="n15-h2">
          The quoting happens on your site, and the money stays yours.
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
