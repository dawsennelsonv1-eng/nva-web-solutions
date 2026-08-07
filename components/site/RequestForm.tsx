'use client';

import { useState, type ComponentPropsWithoutRef, type FormEvent } from 'react';
import {
  submitImplementationRequest,
  type ImplementationRequestResult,
} from '@/app/actions/implementation';

/**
 * components/site/RequestForm.tsx — the one form, two questions.
 *
 * ============================================================================
 * WHY BOTH SURFACES SHARE THIS COMPONENT
 * ============================================================================
 *
 * Two places ask a contractor for the same facts:
 *
 *   kind="tool_install"  /start — he has seen a tool and wants it on his site
 *   kind="custom_build"  the homepage — something in his business is slow or
 *                        expensive and he wants to know if it can be built
 *
 * They differ in three labels and one field. Building them as two components
 * would mean two validation surfaces, two error states and two places to fix
 * the next thing that is wrong with either. They are one component with a
 * `kind` prop, and the server action they both call splits on the same value.
 *
 * ============================================================================
 * WHAT IS REQUIRED, AND WHY IT IS SO LITTLE
 * ============================================================================
 *
 * Name, email, and the description. Nothing else.
 *
 * This form competes with a man on a phone at the end of a working day
 * deciding whether to bother. Every additional required field is a place he
 * stops. A row with a name, an email and two sentences about what is broken is
 * worth more than a perfect row that was never sent — so business name, phone,
 * website, field and customer type are all optional and marked as optional,
 * out loud, so he can see how short the form really is before he starts.
 *
 * The optional fields are still ASKED, because the ones who answer them are
 * telling you what to build and are worth far more than the ones who do not.
 *
 * ============================================================================
 * NO useTransition, AND THAT IS A COMPATIBILITY DECISION
 * ============================================================================
 *
 * Concierge.tsx and VoteForm.tsx both call startTransition with an async
 * callback. Under @types/react 18.3.12 — the version this repo pins — that does
 * not typecheck: TransitionFunction returns VoidOrUndefinedOnly, and an async
 * arrow returns Promise<void>. Something in this project's setup evidently
 * tolerates it, since those files are deployed, but I could not see what.
 *
 * Rather than copy a pattern I cannot verify, this form tracks pending with
 * plain useState. It behaves identically here — there is no concurrent
 * rendering benefit to a transition around a single form submission — and it
 * compiles under any React typings.
 *
 * ============================================================================
 * NO onSubmit VIA THE `action` PROP
 * ============================================================================
 *
 * The handler is onSubmit with preventDefault, matching VoteForm and Concierge.
 * A form whose `action` is a server action posts natively when JavaScript has
 * not hydrated yet, which on a slow connection means the visitor loses the
 * inline result and gets a navigation instead.
 *
 * ============================================================================
 * THE SUCCESS STATE REPLACES THE FORM
 * ============================================================================
 *
 * On success the fields are gone and what remains says what happens next and
 * when — not "thank you". A contractor who has just described his business to
 * a stranger wants to know whether anyone read it, and by when.
 *
 * NOTE, and it is in the server action too: nobody is emailed when this fires.
 * The copy below promises a reply within one working day, which is a promise
 * that depends on somebody watching the table. Do not ship this to paid traffic
 * before that is true — an unkept reply promise to this audience is worse than
 * no promise, and this is the page where trust is being asked for.
 */

export interface RequestFormProps {
  kind: 'tool_install' | 'custom_build';
  /** Which tool page this came from. Null on the homepage. */
  toolId?: string | null;
  /** Attribution, e.g. 'tool_page:epoxy' or 'home_custom'. */
  source: string;
}

export function RequestForm({ kind, toolId = null, source }: RequestFormProps) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImplementationRequestResult | null>(null);

  const isInstall = kind === 'tool_install';

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    setPending(true);
    void (async () => {
      try {
        setResult(
          await submitImplementationRequest({
            kind,
            toolId,
            source,
            name: String(fd.get('name') ?? ''),
            email: String(fd.get('email') ?? ''),
            phone: String(fd.get('phone') ?? ''),
            businessName: String(fd.get('businessName') ?? ''),
            businessField: String(fd.get('businessField') ?? ''),
            websiteUrl: String(fd.get('websiteUrl') ?? ''),
            customerType: String(fd.get('customerType') ?? ''),
            description: String(fd.get('description') ?? ''),
          })
        );
      } catch {
        setResult({
          ok: false,
          code: 'write_failed',
          message: 'That did not send. Check your connection and try again.',
        });
      } finally {
        setPending(false);
      }
    })();
  };

  if (result?.ok) {
    return (
      <div className="rf-done" role="status">
        <p className="rf-done-h">That is with us.</p>
        <p className="n15-body">
          {isInstall
            ? 'We will look at your site, build the branded version, and send you a link to the working thing. You will hear back within one working day.'
            : 'We will read what you sent and reply within one working day — either with what we think could be built, or with an honest answer that this is not something software fixes.'}
        </p>
      </div>
    );
  }

  return (
    <form className="rf" onSubmit={onSubmit} noValidate>
      <div className="rf-grid">
        <Field name="name" label="Your name" required autoComplete="name" />
        <Field
          name="email"
          label="Email"
          required
          type="email"
          autoComplete="email"
          hint="Where the reply goes."
        />
        <Field name="businessName" label="Business name" optional autoComplete="organization" />
        <Field
          name="businessField"
          label="What you do"
          optional
          placeholder="Epoxy floors, repainting, septic pumping…"
        />
        <Field
          name="websiteUrl"
          label="Your website"
          optional
          inputMode="url"
          placeholder="joesfloors.com"
          hint="However you write it is fine."
        />
        <Field name="phone" label="Phone" optional type="tel" autoComplete="tel" />
        <Field
          name="customerType"
          label="Who your customers are"
          optional
          placeholder="Homeowners, builders, property managers…"
        />
      </div>

      <label className="rf-field rf-wide" htmlFor="rf-description">
        <span className="rf-label">
          {isInstall ? 'Tell us about your business' : 'What is the problem'}
          <span className="rf-req">required</span>
        </span>
        <textarea
          id="rf-description"
          name="description"
          rows={5}
          maxLength={4000}
          className="rf-input rf-textarea"
          placeholder={
            isInstall
              ? 'What you do, where you work, and how a job usually comes in.'
              : 'What takes too long, costs too much, or keeps going wrong. Plain words are fine.'
          }
        />
      </label>

      {result && !result.ok && (
        <p className="rf-err" role="alert">
          {result.message}
        </p>
      )}

      <button type="submit" className="n15-btn n15-btn-primary rf-submit" disabled={pending}>
        {pending ? 'Sending…' : isInstall ? 'Send this' : 'Ask us'}
      </button>

      <p className="n15-small rf-foot">
        No newsletter, no automated sequence. This goes to a person.
      </p>
    </form>
  );
}

function Field({
  name,
  label,
  required = false,
  optional = false,
  hint,
  ...rest
}: {
  name: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
} & ComponentPropsWithoutRef<'input'>) {
  const id = 'rf-' + name;
  return (
    <label className="rf-field" htmlFor={id}>
      <span className="rf-label">
        {label}
        {required && <span className="rf-req">required</span>}
        {optional && <span className="rf-opt">optional</span>}
      </span>
      <input id={id} name={name} className="rf-input" {...rest} />
      {hint && <span className="rf-hint">{hint}</span>}
    </label>
  );
}
