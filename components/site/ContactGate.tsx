'use client';

import { useState } from 'react';

/**
 * components/site/ContactGate.tsx — WHERE THE PRICE AND THE RENDER ARE BOUGHT
 * WITH A NAME AND A NUMBER.
 *
 * ============================================================================
 * WHY THERE IS A GATE AT ALL, AND WHY IT IS HERE AND NOT EARLIER
 * ============================================================================
 *
 * Everything before this point is free and stays free: the photographs, the
 * measurement, browsing the finishes. A visitor who never fills this in has
 * still had a useful experience and has cost the contractor one vision call.
 *
 * The gate sits at the exact point where the visitor wants something SPECIFIC
 * — his number, and his own garage in the finish he picked. That is the moment
 * he is most willing to identify himself, and it is also the moment the
 * software is about to spend real money: a render costs ten to forty times a
 * vision analysis. Gating it is what stops an anonymous stranger emptying a
 * prepaid balance one picture at a time.
 *
 * Both of those are true at once, which is why this is the right seam. A gate
 * before the measurement would trade the demonstration for the lead and get
 * neither.
 *
 * ============================================================================
 * WHAT IT DOES NOT DO
 * ============================================================================
 *
 * NO ACCOUNT. No password, no confirmation email, no "create a profile". Four
 * fields, one button. A homeowner pricing a garage will not make an account
 * and should not be asked to.
 *
 * NO FAKE SCARCITY. There is no countdown, no "3 people are viewing this", no
 * invented deadline. The reason to fill this in is stated plainly — the price
 * and the picture are on the other side of it — and that is the whole pitch.
 *
 * NO CLAIM THE DETAILS GO NOWHERE. They go to the contractor; that is the
 * product. The copy says so rather than implying privacy the software does not
 * provide.
 *
 * ============================================================================
 * VALIDATION IS DELIBERATELY LOOSE, AND MATCHES THE SERVER
 * ============================================================================
 *
 * app/actions/lead.ts requires a name of 2+, a phone of 10+ characters, a
 * parseable email and a timeline. This form checks the same four things and
 * nothing more.
 *
 * It does NOT regex the phone number. Every phone regex ever written rejects
 * somebody's real number, and losing a lead to a format opinion is the most
 * expensive validation failure available here. The server normalises digits;
 * that is enough.
 *
 * The submit button is never disabled to enforce a rule. A disabled button
 * with no explanation is how a form dead-ends somebody who cannot see what is
 * wrong — errors appear on submit, named, next to the thing that caused them.
 */

export interface ContactGateFields {
  name: string;
  phone: string;
  email: string;
  timeline: string;
}

export interface ContactGateProps {
  /** What is waiting on the other side. Written by the caller, shown as-is. */
  headline: string;
  blurb: string;
  submitLabel: string;
  /**
   * Runs the caller's server work. Returns an error STRING to display, or null
   * on success — the gate does not know what a lead is and should not.
   */
  onSubmit: (fields: ContactGateFields) => Promise<string | null>;
}

/**
 * Fixed options rather than a free-text box. A homeowner does not know how to
 * phrase a timeline and a contractor cannot sort thirty different spellings of
 * "soon". Three answers cover the actual decision: is this a job, a plan, or a
 * daydream — and the contractor calls them in that order.
 */
const TIMELINES = ['As soon as possible', 'In the next few months', 'Just getting an idea'];

export function ContactGate({ headline, blurb, submitLabel, onSubmit }: ContactGateProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [timeline, setTimeline] = useState<string>(TIMELINES[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (busy) return;

    // The same four checks the server makes, phrased for a person.
    if (name.trim().length < 2) {
      setError('Add your name so the installer knows who is calling.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setError('That phone number looks short. Include the area code.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Check the email address — the quote gets sent there.');
      return;
    }

    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const message = await onSubmit({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          timeline,
        });
        // On success the CALLER unmounts this component by changing state, so
        // busy is deliberately not cleared on the happy path — clearing it
        // would flash an enabled button for a frame before the swap.
        if (message) {
          setError(message);
          setBusy(false);
        }
      } catch {
        setError('That did not go through. Try again.');
        setBusy(false);
      }
    })();
  };

  return (
    <div className="cg">
      <p className="cg-h">{headline}</p>
      <p className="cg-sub">{blurb}</p>

      <div className="cg-fields">
        <label className="cg-field">
          <span className="cg-label">Your name</span>
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="cg-input"
          />
        </label>

        <label className="cg-field">
          <span className="cg-label">Mobile number</span>
          {/* type="tel" so a phone shows the keypad. inputMode as well,
              because some Android keyboards honour one and not the other. */}
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="cg-input"
          />
        </label>

        <label className="cg-field cg-field-wide">
          <span className="cg-label">Email</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="cg-input"
          />
        </label>
      </div>

      <fieldset className="cg-when">
        <legend className="cg-label">When are you thinking?</legend>
        <div className="cg-when-row">
          {TIMELINES.map((t) => (
            <button
              key={t}
              type="button"
              className="cg-when-opt"
              aria-pressed={t === timeline}
              onClick={() => setTimeline(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <p className="cg-err" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className="n15-btn n15-btn-primary cg-go"
        onClick={submit}
        disabled={busy}
      >
        {busy ? 'Working…' : submitLabel}
      </button>

      <p className="cg-fine">
        Your details go to the installer so they can quote the job properly. No
        account, no password, and you can say no when they call.
      </p>
    </div>
  );
}
