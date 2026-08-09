import Link from 'next/link';
import {
  BASE_RATES,
  REFERENCE_FINISHES,
  REFERENCE_RULES,
  REFERENCE_SQFT_MAX,
  REFERENCE_SQFT_MIN,
  dollars,
  wholeDollars,
} from '@/lib/site/reference-rates';

/**
 * components/site/Sections.tsx — the static blocks of the homepage, PHASE 15B.
 *
 * THE CONTENT IS UNCHANGED. Every step, every table row, every term, every one
 * of the seven questions and every footer link is the same text it was. What
 * changed is the system it is set in: the old industrial thesis — square
 * corners, opaque ground slabs, hairline dividers, 10px uppercase mono — is
 * cancelled, and these sections now sit on the gradient field in the 15A type
 * with depth and generous radii.
 *
 * PHASE 16A: the Terms section is REMOVED from this file. Its six lines now
 * live only on /terms, which the footer already links to. Two copies of a
 * promise is how a promise starts drifting, and the homepage is being made
 * generic across trades while those six lines are specifics of one commercial
 * arrangement. The Machinery section is kept here but is no longer mounted on
 * the homepage — see app/(public)/page.tsx.
 *
 * ONE REAL CONTENT CHANGE FROM 15B, and it is a removal: Integration step 01 said "Right
 * now that means concrete and epoxy coating." Painting has been registered in
 * lib/verticals/manifest.ts since Phase 11 and resolves to IN SERVICE, so that
 * sentence had quietly become false. It now names what the registry actually
 * reports rather than a hardcoded pair.
 *
 * Still server components, all of them. No client JavaScript ships for
 * anything in this file — the FAQ is native <details>, not an accordion — which
 * is one fewer hydration boundary competing with the tool cards for main-thread
 * time on a mid-range Android.
 *
 * NO SECTION HERE PAINTS AN OPAQUE BACKGROUND. That was the 15A.3 bug: an
 * opaque in-flow block paints over a z-index:-1 fixed field. Section separation
 * is now by rhythm and by the cards' own surfaces, not by changing the ground
 * colour underneath them.
 */

/* ------------------------------------------------------------------ 3 steps */

export function Integration() {
  const steps = [
    {
      n: '01',
      head: 'Choose your tool',
      body: 'Pick the one built for your trade. What is running today is shown above, checked against the code as the page loads, and what comes next is decided in public on the build queue.',
    },
    {
      n: '02',
      head: 'We brand it',
      body: 'We pull your logo and colours off your existing site and match the tool to them, then send you a link to the working thing before you pay anything.',
    },
    {
      n: '03',
      head: 'One line of code and it is live',
      body: 'You paste a single script tag where you want it to sit. If your site was built by somebody else, send them the line, or send it to us and we will do it.',
    },
  ];

  return (
    <section className="n15-sec" aria-labelledby="integration-h">
      <div className="n15-in">
        <p className="n15-eyebrow">Getting it running</p>
        <h2 id="integration-h" className="n15-h2">
          You do not have to know how to code.
        </h2>
        <p className="n15-lede">
          Whichever tool you pick, it goes live the same way. Three steps, and
          one of them is yours.
        </p>

        {/* The numbering stays because this genuinely is a sequence — you
            cannot brand a tool you have not chosen. Numbered markers on a set
            of unordered features would be decoration; here the order carries
            information the reader needs. */}
        <div className="st-grid">
          {steps.map((s) => (
            <div key={s.n} className="st-card">
              <p className="st-n">{s.n}</p>
              <h3>{s.head}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- machinery */

export function Machinery() {
  return (
    <section className="n15-sec" aria-labelledby="machinery-h">
      <div className="n15-in">
        <p className="n15-eyebrow">The arithmetic, in full</p>
        <h2 id="machinery-h" className="n15-h2">
          Here is the pricing model itself.
        </h2>
        <p className="n15-lede">
          YOU set every rate, every adjustment, every fee and every minimum
          below, and you change any of them from your dashboard in about a
          minute. This is one worked example so you can see the whole
          calculation rather than a description of it. Nothing here is our price
          for your work — it is your price, running.
        </p>

        <div className="mx-wrap">
          <div className="mx-scroll">
            <table className="mx-table">
              <caption className="sr15a">
                Reference pricing configuration, Dallas residential
              </caption>
              <thead>
                <tr>
                  <th scope="col">Input</th>
                  <th scope="col">Rate</th>
                  <th scope="col">How it applies</th>
                </tr>
              </thead>
              <tbody>
                {REFERENCE_FINISHES.map((f) => (
                  <tr key={f.id}>
                    <td>{f.label}</td>
                    <td className="mx-rate">{dollars(BASE_RATES[f.tierKey])} / sqft</td>
                    <td className="mx-how">× square feet</td>
                  </tr>
                ))}
                <tr>
                  <td>Surface preparation</td>
                  <td className="mx-rate">
                    {dollars(REFERENCE_RULES.prepRateCentsPerSqft)} / sqft
                  </td>
                  <td className="mx-how">× square feet, added to coating</td>
                </tr>
                {REFERENCE_RULES.conditionModifiers.map((m) => (
                  <tr key={m.id}>
                    <td>{m.label}</td>
                    <td className="mx-rate">+{Math.round(m.pctAdjust * 100)}%</td>
                    <td className="mx-how">of the subtotal, added not compounded</td>
                  </tr>
                ))}
                <tr>
                  <td>Mobilisation</td>
                  <td className="mx-rate">
                    {wholeDollars(REFERENCE_RULES.mobilizationFeeCents)}
                  </td>
                  <td className="mx-how">flat, after the percentages</td>
                </tr>
                <tr>
                  <td>Job minimum</td>
                  <td className="mx-rate">{wholeDollars(REFERENCE_RULES.minimumJobCents)}</td>
                  <td className="mx-how">
                    the midpoint is raised to this if it lands under
                  </td>
                </tr>
                <tr>
                  <td>Quoted band</td>
                  <td className="mx-rate">
                    ±{Math.round(REFERENCE_RULES.rangeSpreadPct * 100)}%
                  </td>
                  <td className="mx-how">
                    around the midpoint, low clamped to the minimum
                  </td>
                </tr>
                <tr>
                  <td>Accepted range</td>
                  <td className="mx-rate">
                    {REFERENCE_SQFT_MIN.toLocaleString('en-US')}–
                    {REFERENCE_SQFT_MAX.toLocaleString('en-US')} sqft
                  </td>
                  <td className="mx-how">
                    outside it, the widget takes the lead instead of guessing
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p className="n15-small n15-measure">
          You set every number in this table. The AI never sets a price and
          never adjusts one — it reads the photo and suggests the slab
          condition, within limits you decide. The figure your customer sees
          comes from your own rates, every single time.
        </p>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- faq */

export function Faq() {
  const items = [
    {
      q: 'Where does my customer data go?',
      a: 'Into a database we run, in your own tenant, and nowhere else. It is not sold, not pooled with other contractors, and not used to train anything. You can export all of it as a file at any time, including after you cancel.',
    },
    {
      q: 'Do I need to know how to code?',
      a: 'No. Installing it is pasting one line into your site. If you would rather not touch it, send us your website login or your web person’s email and we will do it and send you the confirmation.',
    },
    {
      q: 'How long until it is live?',
      a: 'We build the branded version first and send you a link to it. Once you have looked at it and paid the setup fee, going live is the one line of code — usually the same day.',
    },
    {
      q: 'Will it match my branding?',
      a: 'We pull the logo and colours off your existing site automatically, then adjust by hand. You see it before you pay. If it does not look like yours, we fix it or you do not buy it.',
    },
    {
      q: 'Does it work on a phone?',
      a: 'Most of your traffic is a phone, so it is built for one first. It is a single column, thumb-reachable, and it does not need a photo to produce a number.',
    },
    {
      q: 'Am I locked in?',
      a: 'No contract and no minimum term. You cancel in the dashboard, the widget drops back to a plain contact form on your site rather than disappearing, and your leads keep arriving.',
    },
    {
      q: 'My trade is not on the list.',
      a: 'Then it is on the build queue, or it is not built yet and we say so. The queue is public, it is ordered by demand, and one tool enters build per month. You can see exactly where your trade sits.',
    },
  ];

  return (
    <section className="n15-sec" aria-labelledby="faq-h">
      <div className="n15-in">
        <p className="n15-eyebrow">Questions</p>
        <h2 id="faq-h" className="n15-h2">
          The seven questions we actually get.
        </h2>

        <div className="fq">
          {items.map((i) => (
            <details key={i.q}>
              <summary>{i.q}</summary>
              <p>{i.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ footer */

export function Footer() {
  const cols = [
    {
      head: 'Product',
      links: [
        { href: '/demo', label: 'Demo' },
        { href: '/pricing', label: 'Pricing' },
        { href: '/queue', label: 'Build queue' },
      ],
    },
    {
      head: 'Company',
      links: [
        { href: '/about', label: 'About' },
        { href: '/support', label: 'Support' },
      ],
    },
    {
      head: 'Legal',
      links: [
        { href: '/privacy', label: 'Privacy' },
        { href: '/terms', label: 'Terms' },
      ],
    },
  ];

  return (
    <footer className="ft">
      <div className="ft-in">
        {cols.map((c) => (
          <div key={c.head}>
            <p className="ft-h">{c.head}</p>
            <div className="ft-links">
              {c.links.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      {/*
        NO PHYSICAL LOCATION HERE, and that is a correction rather than an
        omission. Earlier phases printed "Dallas, Texas" in this line, on
        /privacy, on /terms and on /support. I wrote that, and it was simply not
        true — Dallas is the market this is aimed at, not where the business
        sits.

        A false address is worse than no address. It is exactly the kind of
        small claim a suspicious buyer checks, and finding it wrong costs more
        trust than never having made it. There is no obligation to publish where
        a founder physically works, so this line names the company and the
        market it serves, both of which are true.

        The legal selling entity IS still disclosed, on /pricing and /terms,
        which is where a payment disclosure belongs.
      */}
      <p className="ft-mark">NVA Digital Solutions · Serving Dallas–Fort Worth</p>
    </footer>
  );
}
