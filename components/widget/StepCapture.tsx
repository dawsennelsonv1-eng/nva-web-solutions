'use client';

import { useEffect, useState } from 'react';
import { PriceSpan } from './PriceSpan';

/**
 * STEP 4 — the lead-capture paywall, and the payoff.
 *
 * The price is ON SCREEN and blurred. Not hidden, not "submit to see" — the
 * figures are visibly there, one field away. That difference is the entire
 * conversion mechanic: a blurred number is a thing being withheld, and a
 * missing number is a thing that might not exist.
 *
 * The unblur is the payoff of the whole experience, so it is the one place
 * the widget spends a real transition. Under reduced motion the blur simply
 * lifts, which still reads as a reveal.
 */

export interface CaptureFields {
  name: string;
  phone: string;
  email: string;
  timeline: string;
}

export interface StepCaptureProps {
  lowCents: number;
  highCents: number;
  unlocked: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (fields: CaptureFields) => void;
  contractorName?: string;
  contractorPhone?: string | null;
  quoteUrl?: string | null;
  /** Phase 5: fired once when the (non-unlocked) capture form mounts. */
  onViewed?: () => void;
}

const TIMELINES = ['As soon as possible', 'Within a month', '1-3 months', 'Just researching'];

/** US formatting as the person types. Never reformats what it cannot parse. */
export function formatUsPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
  return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
}

function validate(f: CaptureFields): Partial<Record<keyof CaptureFields, string>> {
  const e: Partial<Record<keyof CaptureFields, string>> = {};
  if (f.name.trim().length < 2) e.name = 'Please enter your name.';
  if (f.phone.replace(/\D/g, '').length !== 10) e.phone = 'Enter a 10-digit phone number.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
  if (!f.timeline) e.timeline = 'Pick a timeframe.';
  return e;
}

export function StepCapture({
  lowCents,
  highCents,
  unlocked,
  busy,
  error,
  onSubmit,
  contractorName = 'The contractor',
  contractorPhone,
  quoteUrl,
  onViewed,
}: StepCaptureProps) {
  const [fields, setFields] = useState<CaptureFields>({ name: '', phone: '', email: '', timeline: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof CaptureFields, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof CaptureFields, boolean>>>({});

  useEffect(() => {
    if (!unlocked) onViewed?.();
    // Fire once per mount of the actual form, not on every keystroke re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: keyof CaptureFields, v: string) => {
    const next = { ...fields, [k]: k === 'phone' ? formatUsPhone(v) : v };
    setFields(next);
    if (touched[k]) setErrors(validate(next));
  };

  const blur = (k: keyof CaptureFields) => {
    setTouched((t) => ({ ...t, [k]: true }));
    setErrors(validate(fields));
  };

  const submit = () => {
    const e = validate(fields);
    setErrors(e);
    setTouched({ name: true, phone: true, email: true, timeline: true });
    if (Object.keys(e).length === 0) onSubmit(fields);
  };

  if (unlocked) {
    return (
      <div className="space-y-5">
        <div className="rounded-milled border border-cure/40 bg-cure/5 p-3">
          <p className="font-data text-xs uppercase tracking-wide text-cure">Quote unlocked</p>
          <p className="mt-1 text-base">
            {contractorName} has your details and will confirm the final price.
          </p>
        </div>
        <PriceSpan lowCents={lowCents} highCents={highCents} />
        {quoteUrl ? (
          <div className="rounded-milled border bg-sheet p-3">
            <p className="font-data text-xs uppercase tracking-wide text-rule">Your quote</p>
            <a href={quoteUrl} className="mt-1 block break-all text-base underline underline-offset-4">
              {quoteUrl}
            </a>
            <p className="mt-1 font-data text-xs text-rule">Keep this link — it stays live.</p>
          </div>
        ) : null}
        {contractorPhone ? (
          <a
            href={'tel:' + contractorPhone.replace(/\s/g, '')}
            className="flex min-h-[3rem] w-full items-center justify-center rounded-milled border border-ink bg-sheet px-4 text-base font-semibold"
          >
            Call {contractorName}
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="font-data text-xs uppercase tracking-wide text-rule">Your estimate</p>
        <PriceSpan lowCents={lowCents} highCents={highCents} obscured />
        <p className="text-center font-data text-sm text-rule">
          Enter your details to see the figures
        </p>
      </div>

      <div className="space-y-3">
        {([
          { k: 'name' as const, label: 'Name', type: 'text', autoComplete: 'name', mode: 'text' as const },
          { k: 'phone' as const, label: 'Phone', type: 'tel', autoComplete: 'tel', mode: 'tel' as const },
          { k: 'email' as const, label: 'Email', type: 'email', autoComplete: 'email', mode: 'email' as const },
        ]).map((f) => (
          <label key={f.k} className="block">
            <span className="font-data text-xs uppercase tracking-wide text-rule">{f.label}</span>
            <input
              type={f.type}
              inputMode={f.mode}
              autoComplete={f.autoComplete}
              value={fields[f.k]}
              onChange={(e) => set(f.k, e.target.value)}
              onBlur={() => blur(f.k)}
              aria-invalid={Boolean(errors[f.k])}
              aria-describedby={errors[f.k] ? f.k + '-err' : undefined}
              className={
                'mt-1 min-h-[3rem] w-full rounded-milled border bg-sheet px-3 text-base text-ink placeholder:text-rule ' +
                (errors[f.k] ? 'border-danger' : 'border-rule')
              }
            />
            {errors[f.k] ? (
              <span id={f.k + '-err'} role="alert" className="mt-1 block font-data text-sm text-danger">
                {errors[f.k]}
              </span>
            ) : null}
          </label>
        ))}

        <fieldset>
          <legend className="font-data text-xs uppercase tracking-wide text-rule">
            When do you want it done?
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {TIMELINES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  set('timeline', t);
                  setTouched((x) => ({ ...x, timeline: true }));
                }}
                aria-pressed={fields.timeline === t}
                className={
                  'min-h-[3rem] rounded-milled border px-3 text-sm transition-colors duration-step ' +
                  (fields.timeline === t ? 'border-ink bg-ink text-sheet' : 'border-rule bg-sheet')
                }
              >
                {t}
              </button>
            ))}
          </div>
          {errors.timeline ? (
            <span role="alert" className="mt-1 block font-data text-sm text-danger">
              {errors.timeline}
            </span>
          ) : null}
        </fieldset>
      </div>

      {error ? (
        <p role="alert" className="rounded-milled border border-danger/40 bg-danger/5 p-3 text-sm">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="min-h-[3rem] w-full rounded-milled bg-hazard px-4 font-body text-base font-semibold text-sheet transition-colors duration-step hover:bg-hazard/90 disabled:opacity-60"
      >
        {busy ? 'Sending…' : 'Show me the price'}
      </button>
    </div>
  );
}
