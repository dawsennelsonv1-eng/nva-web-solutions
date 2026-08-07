import type { Metadata } from 'next';
import Link from 'next/link';
import { GradientField } from '@/components/site/GradientField';

/**
 * app/(public)/terms/page.tsx — NEW ROUTE, PHASE 15C.
 *
 * VERIFY: not lawyer-reviewed. Same caveat as /privacy and for the same reason
 * — every clause below restates something the homepage already promises or the
 * code already does, which makes it accurate, but accurate is not the same as
 * enforceable. Have it looked at before you sign a contractor up.
 *
 * WHY EVERY CLAUSE IS ALREADY TRUE ELSEWHERE. The Terms block on the homepage
 * (components/site/Sections.tsx) makes six specific promises, and two of them —
 * lead capture never stopping, and the widget degrading rather than breaking —
 * are properties of how the software is built rather than commitments about
 * behaviour. This page restates them because a promise made only in marketing
 * copy is not a term, and because a contractor who reads both should find no
 * daylight between them. If you change one, change the other in the same
 * commit.
 *
 * WHAT THIS PAGE DELIBERATELY DOES NOT DO: promise a number of leads, promise
 * uptime, or claim any certification. There is no SOC 2, there is no uptime
 * measured by anything outside this system, and neither word appears here.
 */

const UPDATED = 'August 2026';

export const metadata: Metadata = {
  title: 'Terms',
  description:
    'What you are agreeing to: no contract, no revenue share, a 30-day setup-fee refund, and lead capture that does not stop.',
};

export default function TermsPage() {
  return (
    <>
      <GradientField />
      <article className="pr">
        <p className="n15-eyebrow">Terms</p>
        <h1>What you are actually agreeing to.</h1>

        <p>
          Short, because it is short. The same six points are on the homepage and
          they mean the same thing here.
        </p>

        <h2>What you pay</h2>
        <p>
          A one-off setup fee and a monthly fee, both shown on the{' '}
          <Link href="/pricing">pricing page</Link> and both charged through
          Stripe. We take no share of what you invoice, no commission on a lead,
          and no percentage of any job — not now and not later. Founding pricing
          is locked for the life of the account and does not rise when the list
          price does.
        </p>

        <h2>No contract</h2>
        <p>
          No minimum term. You cancel from the dashboard in one click, and it
          takes effect at the end of the period you have already paid for.
          Monthly fees for months already used are not refunded.
        </p>

        <h2>The 30-day refund</h2>
        <p>
          Tell us inside 30 days of setup that it is not working for you and the
          setup fee comes back in full — no forms and no questions. You keep
          every lead it captured in the meantime.
        </p>

        <h2>What we do not promise</h2>
        <ul>
          <li>
            A number of leads. This converts traffic you already have; it does
            not create traffic. If nobody visits your site, it cannot help you.
          </li>
          <li>
            That an AI reading of a photograph is correct. It suggests a surface
            condition within limits you set. You confirm the job on site, and the
            final price is always yours.
          </li>
          <li>
            That a finish preview matches the finished work. A preview is an
            illustration of an intention, labelled as one wherever it appears.
          </li>
        </ul>

        <h2>What the software guarantees by construction</h2>
        <div className="pr-note">
          <p className="pr-note-k">These are properties, not intentions</p>
          <p>
            <strong>Lead capture never stops.</strong> Enquiries run on a path
            that does not check billing state. A lapsed payment or a used-up
            usage cap costs the extras — never the enquiry.
          </p>
          <p>
            <strong>The widget never breaks your site.</strong> Whatever else
            happens, it falls back to a plain contact form rather than erroring
            or vanishing.
          </p>
        </div>

        <h2>Your data</h2>
        <p>
          Your rates, your account and your customers&apos; enquiries are yours.
          Full export as a file at any time, including after you cancel. We do
          not sell it, pool it with other contractors, or use it to train
          anything. See <Link href="/privacy">privacy</Link> for the detail.
        </p>

        <h2>Your obligations</h2>
        <ul>
          <li>
            The rates you configure are yours. You are responsible for them being
            right, and for honouring the ranges your customers are shown.
          </li>
          <li>
            You are the person your customers are dealing with. Their enquiry
            comes to you and your own obligations to them are yours.
          </li>
          <li>
            Do not use the tool to quote work you are not licensed or insured to
            perform.
          </li>
        </ul>

        <h2>Ending it from our side</h2>
        <p>
          We can close an account for non-payment after notice, or immediately
          for use that is fraudulent or unlawful. In either case you get your
          data export and the widget falls back to a contact form on your site
          rather than disappearing.
        </p>

        <div className="pr-note">
          <p className="pr-note-k">Plain language, not legal advice</p>
          <p>
            This page describes the arrangement in ordinary words and has not
            been reviewed by a lawyer. If you need something more formal before
            you sign up, ask and we will sort it out.
          </p>
        </div>

        <p className="pr-stamp">Last updated {UPDATED} · NVA Digital Solutions, Dallas, Texas</p>
      </article>
    </>
  );
}
