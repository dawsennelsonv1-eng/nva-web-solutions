import Link from 'next/link';
import {
  REFERENCE_FINISHES,
  REFERENCE_RULES,
  REFERENCE_SQFT_MAX,
  REFERENCE_SQFT_MIN,
  dollars,
  wholeDollars,
} from '@/lib/site/reference-rates';

/**
 * components/site/Sections.tsx — the static blocks of the homepage.
 *
 * Server components, all of them. No client JavaScript is shipped for any
 * section in this file, including the FAQ, which uses native <details> rather
 * than an accordion component. That is one fewer hydration boundary competing
 * with the hero for main-thread time on a mid-range Android.
 *
 * Section separation is by CHANGE OF GROUND COLOUR — Cure Gray to Ticket White
 * to Machine Black — with no rule at the seam. Full-bleed hairline dividers
 * between sections are the broadsheet tell that 13A discards.
 */

/* ------------------------------------------------------------------ 3 steps */

export function Integration() {
  const steps = [
    {
      n: '01',
      head: 'Choose your tool',
      body: 'Pick the quoting widget for your trade. Right now that means concrete and epoxy coating. What comes next is decided in public on the build queue.',
    },
    {
      n: '02',
      head: 'We brand it',
      body: 'We pull your logo and colours off your existing site and match the widget to it, then send you a link to the working thing before you pay anything.',
    },
    {
      n: '03',
      head: 'One line of code and it is live',
      body: 'You paste a single script tag where you want it to sit. If your site was built by somebody else, send them the line, or send it to us and we will do it.',
    },
  ];

  return (
    <section className="bg-concrete px-4 py-14" aria-labelledby="integration-h">
      <div className="mx-auto max-w-5xl">
        <h2 id="integration-h" className="font-display text-2xl font-extrabold uppercase">
          You do not have to know how to code
        </h2>
        <p className="mt-2 max-w-[60ch] text-base">
          There are three steps and one of them is yours.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="border border-rule bg-sheet p-4">
              <p className="font-data text-2xs uppercase tracking-[0.08em] text-rule">{s.n}</p>
              <h3 className="mt-1 font-display text-lg font-semibold">{s.head}</h3>
              <p className="mt-2 text-sm">{s.body}</p>
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
    <section className="bg-sheet px-4 py-14" aria-labelledby="machinery-h">
      <div className="mx-auto max-w-5xl">
        <h2 id="machinery-h" className="font-display text-2xl font-extrabold uppercase">
          Here is the pricing model itself
        </h2>
        <p className="mt-2 max-w-[60ch] text-base">
          This is the whole calculation, not a description of one. It is the configuration the
          widget above is running. Yours is your own — you set every number in this table, and you
          can change any of them from the dashboard.
        </p>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <caption className="sr-only">Reference pricing configuration, Dallas residential</caption>
            <thead>
              <tr className="border-y border-rule text-left">
                <th scope="col" className="py-2 pr-3 font-data text-2xs uppercase tracking-[0.08em] text-rule">
                  Input
                </th>
                <th scope="col" className="py-2 pr-3 font-data text-2xs uppercase tracking-[0.08em] text-rule">
                  Rate
                </th>
                <th scope="col" className="py-2 font-data text-2xs uppercase tracking-[0.08em] text-rule">
                  How it applies
                </th>
              </tr>
            </thead>
            <tbody>
              {REFERENCE_FINISHES.map((f) => (
                <tr key={f.id} className="border-b border-rule">
                  <td className="py-2 pr-3">{f.label}</td>
                  <td className="py-2 pr-3 font-data tabular">
                    {dollars(REFERENCE_RULES.baseRateCentsPerSqft[f.tierKey])} / sqft
                  </td>
                  <td className="py-2">× square feet</td>
                </tr>
              ))}
              <tr className="border-b border-rule">
                <td className="py-2 pr-3">Surface preparation</td>
                <td className="py-2 pr-3 font-data tabular">
                  {dollars(REFERENCE_RULES.prepRateCentsPerSqft)} / sqft
                </td>
                <td className="py-2">× square feet, added to coating</td>
              </tr>
              {REFERENCE_RULES.conditionModifiers.map((m) => (
                <tr key={m.id} className="border-b border-rule">
                  <td className="py-2 pr-3">{m.label}</td>
                  <td className="py-2 pr-3 font-data tabular">
                    +{Math.round(m.pctAdjust * 100)}%
                  </td>
                  <td className="py-2">of the subtotal, added not compounded</td>
                </tr>
              ))}
              <tr className="border-b border-rule">
                <td className="py-2 pr-3">Mobilisation</td>
                <td className="py-2 pr-3 font-data tabular">
                  {wholeDollars(REFERENCE_RULES.mobilizationFeeCents)}
                </td>
                <td className="py-2">flat, after the percentages</td>
              </tr>
              <tr className="border-b border-rule">
                <td className="py-2 pr-3">Job minimum</td>
                <td className="py-2 pr-3 font-data tabular">
                  {wholeDollars(REFERENCE_RULES.minimumJobCents)}
                </td>
                <td className="py-2">the midpoint is raised to this if it lands under</td>
              </tr>
              <tr className="border-b border-rule">
                <td className="py-2 pr-3">Quoted band</td>
                <td className="py-2 pr-3 font-data tabular">
                  ±{Math.round(REFERENCE_RULES.rangeSpreadPct * 100)}%
                </td>
                <td className="py-2">around the midpoint, low clamped to the minimum</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Accepted range</td>
                <td className="py-2 pr-3 font-data tabular">
                  {REFERENCE_SQFT_MIN.toLocaleString('en-US')}–
                  {REFERENCE_SQFT_MAX.toLocaleString('en-US')} sqft
                </td>
                <td className="py-2">outside it, the widget takes the lead instead of guessing</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-4 max-w-[60ch] text-sm text-rule">
          The AI never sets a price. It reads the photo and suggests the slab condition; the number
          comes from this table every time, which is why a quote still works when the AI is down.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- terms */

export function Terms() {
  const terms = [
    'No contract. Cancel from the dashboard in one click.',
    'Every lead reaches you regardless of billing status. Lead capture never stops.',
    'The widget degrades to a plain contact form and never breaks your site — payment lapse, usage cap, or API outage.',
    'Full data export any time.',
    'Unhappy within 30 days and the setup fee is refunded.',
    'Payments are processed by Stripe. We never touch your customers’ money.',
  ];

  return (
    <section className="bg-ink px-4 py-14 text-sheet" aria-labelledby="terms-h">
      <div className="mx-auto max-w-5xl">
        <h2 id="terms-h" className="font-display text-2xl font-extrabold uppercase">
          What you are actually agreeing to
        </h2>
        <ul className="mt-6 max-w-[60ch]">
          {terms.map((t) => (
            <li key={t} className="border-b border-rule py-3 text-base last:border-b-0">
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-[60ch] text-sm text-rule">
          The second and third of those are properties of how the software is built, not promises
          about how we will behave. Lead capture runs on a path that does not depend on billing
          state, and the widget falls back to a contact form rather than failing.
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
    <section className="bg-concrete px-4 py-14" aria-labelledby="faq-h">
      <div className="mx-auto max-w-5xl">
        <h2 id="faq-h" className="font-display text-2xl font-extrabold uppercase">
          The seven questions we actually get
        </h2>
        <div className="mt-6 max-w-[60ch] border-t border-rule">
          {items.map((i) => (
            <details key={i.q} className="border-b border-rule">
              <summary className="cursor-pointer py-3 text-base marker:text-rule">{i.q}</summary>
              <p className="pb-3 text-sm">{i.a}</p>
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
    <footer className="bg-ink px-4 py-10 text-sheet">
      <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-3">
        {cols.map((c) => (
          <div key={c.head}>
            <p className="font-data text-2xs uppercase tracking-[0.08em] text-rule">{c.head}</p>
            <ul className="mt-2">
              {c.links.map((l) => (
                <li key={l.href} className="py-1.5">
                  <Link href={l.href} className="text-sm text-sheet">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-8 max-w-5xl font-data text-2xs uppercase tracking-[0.08em] text-rule">
        NVA Digital Solutions · Dallas, Texas
      </p>
    </footer>
  );
}
