import type { Metadata } from 'next';
import Link from 'next/link';
import { GradientField } from '@/components/site/GradientField';

/**
 * app/(public)/support/page.tsx — NEW ROUTE, PHASE 15C.
 *
 * ============================================================================
 * READ THIS BEFORE YOU DEPLOY: THE ADDRESS BELOW IS A GUESS
 * ============================================================================
 *
 * VERIFY: SUPPORT_EMAIL falls back to a literal derived from the same guessed
 * production domain that app/layout.tsx uses for metadataBase. I have not seen
 * lib/notify/email.ts, so I do not know what address this system actually
 * sends from, and I will not pretend to.
 *
 * A support page listing an address that bounces is worse than the 404 this
 * route replaces — a 404 tells the truth. Either set
 * NEXT_PUBLIC_SUPPORT_EMAIL in Vercel or edit the constant, and send yourself a
 * test message before this goes to traffic.
 *
 * NO CONTACT FORM, deliberately. There is exactly one lead path in this
 * codebase (app/actions/lead.ts, reached through the widget) and adding a
 * second capture surface here would create a class of enquiry that lands
 * nowhere anyone is watching. A mailto goes to an inbox that already exists.
 */

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@nva.digital';

export const metadata: Metadata = {
  title: 'Support',
  description:
    'How to reach us, what to send, and what happens if the widget stops working on your site.',
};

export default function SupportPage() {
  return (
    <>
      <GradientField />
      <article className="pr">
        <p className="n15-eyebrow">Support</p>
        <h1>Something wrong, or something you want changed.</h1>

        <p>
          Email is the fastest route and it reaches a person, not a ticket queue.
          If your widget is misbehaving on a live site, say so in the subject
          line and it gets looked at first.
        </p>

        <dl className="pr-dl">
          <div>
            <dt>Email</dt>
            <dd>
              <a href={'mailto:' + SUPPORT_EMAIL}>{SUPPORT_EMAIL}</a>
            </dd>
          </div>
          <div>
            <dt>What to include</dt>
            <dd>
              Your website address, roughly when it happened, and what you were
              doing. A screenshot of the widget on your phone answers most
              questions on its own.
            </dd>
          </div>
          <div>
            <dt>Where we are</dt>
            <dd>Dallas, Texas. Replies land during US business hours.</dd>
          </div>
        </dl>

        <h2>If the widget stops working</h2>
        <p>
          It is built so that it cannot take your site down with it. Whatever
          the cause, the result is the same: the widget falls back to a plain
          contact form and the enquiry still reaches you. If you are seeing
          something other than that
          — a blank space, an error, or a price that looks wrong — that is a bug
          and worth an email.
        </p>

        <div className="pr-note">
          <p className="pr-note-k">A price that looks wrong</p>
          <p>
            Check your rate table in the dashboard first. The number the widget
            produces comes from that table every time, so a wrong price is
            almost always a wrong rate, a wrong minimum or a wrong condition
            adjustment — and you can fix those yourself in about a minute
            without waiting for us.
          </p>
        </div>

        <h2>Changing your rates</h2>
        <p>
          You set every number the tool prices with, and you change them from
          the dashboard. There is no deploy and no waiting: the next customer
          gets the new figures. If you want a rate structure the current table
          cannot express, send it over — that is worth knowing about.
        </p>

        <h2>Cancelling</h2>
        <p>
          One click in the dashboard, no contract and no minimum term. Your data
          exports as a file at any time, including after you cancel, and the
          widget drops back to a plain contact form on your site rather than
          disappearing and leaving a gap.
        </p>

        <div className="pr-actions">
          <Link href="/terms" className="n15-btn n15-btn-ghost">
            Read the terms
          </Link>
          <Link href="/privacy" className="n15-btn n15-btn-ghost">
            How data is handled
          </Link>
        </div>
      </article>
    </>
  );
}
