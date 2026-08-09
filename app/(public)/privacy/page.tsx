import type { Metadata } from 'next';
import Link from 'next/link';
import { GradientField } from '@/components/site/GradientField';

/**
 * app/(public)/privacy/page.tsx — NEW ROUTE, PHASE 15C.
 *
 * ============================================================================
 * THIS IS A PLAIN-LANGUAGE DESCRIPTION, NOT A REVIEWED LEGAL DOCUMENT
 * ============================================================================
 *
 * VERIFY, AND THIS ONE MATTERS MORE THAN THE OTHERS: I am not a lawyer and this
 * has not been reviewed by one. What is written below is an accurate account of
 * what the code actually does — every claim is traceable to a file in this repo
 * — but "accurate" and "legally sufficient" are different standards, and the
 * second one depends on where your customers live.
 *
 * Two specific gaps you should assume exist until a lawyer tells you otherwise:
 *
 *   TEXAS. As of the training data available to me, Texas has a consumer data
 *   privacy act with notice obligations that a page like this is expected to
 *   satisfy, and the details of what it requires are exactly the kind of thing
 *   that changes. Check the current position.
 *
 *   RETENTION PERIODS. lib/storage/retention.ts and the cron at
 *   app/api/cron/retention exist and delete stored photos on a schedule, but I
 *   have not seen the number, so this page does not state one. A retention
 *   period published here that does not match the one in the code is a false
 *   statement about data handling, which is the worst kind to get wrong. Read
 *   the constant and fill it in.
 *
 * SCOPE. This covers people visiting this site and homeowners using a widget.
 * A contractor's own obligations to his customers are his, and the page says so
 * rather than implying we have covered him.
 */

const UPDATED = 'August 2026';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What data this system collects, where it goes, who can see it, and how to get it deleted.',
};

export default function PrivacyPage() {
  return (
    <>
      <GradientField />
      <article className="pr">
        <p className="n15-eyebrow">Privacy</p>
        <h1>What we collect, where it goes, and how to get it removed.</h1>

        <p>
          Written in plain language on purpose. If anything here is unclear, ask
          — a policy nobody can read is not a policy.
        </p>

        <h2>If you are a homeowner using a quoting widget</h2>
        <p>
          You are using a tool installed on a contractor&apos;s website. We run
          the software; the contractor is the person you are dealing with, and
          your enquiry is for them.
        </p>
        <ul>
          <li>
            <strong>What you type:</strong> your name, phone number, email, the
            details of the job, and the answers you gave the quoting steps.
          </li>
          <li>
            <strong>Photographs you send:</strong> stored so the contractor has a
            record of what was quoted, and deleted automatically on a schedule.
          </li>
          <li>
            <strong>Technical data:</strong> a session identifier and a one-way
            hash of your IP address, used to stop abuse of the paid features. The
            raw address is never written to the database.
          </li>
        </ul>
        <p>
          That information goes to the contractor whose site you used. It is not
          sold, not shared with other contractors, and not used to train any
          model.
        </p>

        <h2>If you are a contractor using the software</h2>
        <p>
          Your account details, your rate configuration and your customers&apos;
          enquiries live in a database we run, separated per account. You can
          export all of it as a file at any time, including after you cancel.
          Your customers&apos; data is yours — we do not use it for anything
          other than running the tool for you.
        </p>

        <h2>Photographs, and the AI</h2>
        <p>
          A photograph you send is passed to an AI provider so the system can
          read the surface condition and, if you asked for it, produce a preview
          of the finish. It is sent for that request and is not retained by us
          for training. The stored copy exists so there is a record of what was
          shown when a price was agreed, which protects both sides in a
          disagreement.
        </p>

        <div className="pr-note">
          <p className="pr-note-k">Automatic deletion</p>
          <p>
            Stored photographs are removed automatically on a schedule by a job
            that runs daily. Ask us and we will tell you the exact period and
            confirm a specific photo is gone.
          </p>
        </div>

        <h2>Payments</h2>
        <p>
          Card payments are processed by Stripe. We never see or store card
          numbers — Stripe holds those, and we hold a reference that tells us
          whether a subscription is active. Stripe&apos;s own privacy terms cover
          what they do with payment data.
        </p>

        <h2>Getting your data, or getting it deleted</h2>
        <p>
          Email <Link href="/support">support</Link> with enough detail to find
          the record — the website you used and the phone number or email you
          entered. We will send you what we hold, or delete it, and confirm in
          writing when it is done. If you are a homeowner, you may also want to
          ask the contractor directly, since they hold their own copy of your
          enquiry.
        </p>

        <h2>Cookies</h2>
        <p>
          The quoting widget keeps a session identifier so it can remember where
          you were if the page reloads mid-quote. There is no advertising
          tracker on this site and nothing here follows you to other sites.
        </p>

        <div className="pr-note">
          <p className="pr-note-k">Plain language, not legal advice</p>
          <p>
            This page describes what the software actually does. It is not a
            lawyer-reviewed policy and it does not attempt to enumerate rights
            you may have under the law where you live. Ask us anything it does
            not answer and we will answer it directly.
          </p>
        </div>

        <p className="pr-stamp">Last updated {UPDATED} · NVA Digital Solutions</p>
      </article>
    </>
  );
}
