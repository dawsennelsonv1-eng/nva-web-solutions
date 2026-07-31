'use client';

import { useState } from 'react';
import { formatUsPhone, type CaptureFields } from './StepCapture';

/**
 * components/widget/DegradedFlow.tsx — the degraded path, built with the same
 * care as the happy path because it is the one a real homeowner is most likely
 * to hit on the day it matters.
 *
 * THE COPY RULE, which governs every string in this file: the homeowner must
 * never learn that a limit was reached or a payment failed. Telling a
 * homeowner "this contractor's plan ran out" embarrasses him in front of his
 * own customer, which is the single worst thing this product could do — worse
 * than being slow, worse than being wrong, worse than being down. So there is
 * no error styling here, no apology, no "temporarily unavailable", no
 * disabled-looking anything. There is a deliberate flow in which a contractor
 * prices a job properly and gets back to you.
 *
 * Read the strings below as if you were the contractor's customer and he were
 * standing next to you. Nothing in them costs him anything.
 *
 * What differs from the happy path is only: no instant figure, and his phone
 * number promoted to a first-class action rather than a footnote.
 */

export interface DegradedFlowProps {
  contractorName: string;
  contractorPhone: string | null;
  surfaceLabel: string | null;
  acknowledged: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (fields: CaptureFields & { notes: string }) => void;
}

const TIMELINES = ['As soon as possible', 'Within a month', '1-3 months', 'Just researching'];

export function DegradedFlow({
  contractorName,
  contractorPhone,
  surfaceLabel,
  acknowledged,
  busy,
  error,
  onSubmit,
}: DegradedFlowProps) {
  const [fields, setFields] = useState<CaptureFields & { notes: string }>({
    name: '', phone: '', email: '', timeline: '', notes: '',
  });
  const [showErrors, setShowErrors] = useState(false);

  const invalid = {
    name: fields.name.trim().length < 2,
    phone: fields.phone.replace(/\D/g, '').length !== 10,
    email: !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(fields.email.trim()),
    timeline: !fields.timeline,
  };
  const anyInvalid = Object.values(invalid).some(Boolean);

  if (acknowledged) {
    return (
      <div className="space-y-5">
        <div>
          <p className="font-data text-xs uppercase tracking-wide text-cure">Sent</p>
          <h2 className="mt-1 font-display font-condensed text-2xl font-bold">
            {contractorName} has your details.
          </h2>
          <p className="mt-2 text-base">
            They&apos;ll put a price together for your {surfaceLabel ? surfaceLabel.toLowerCase() : 'floor'} and
            get back to you — usually the same day.
          </p>
        </div>

        {contractorPhone ? (
          <div className="rounded-milled border bg-sheet p-4">
            <p className="text-base">Want to talk it through now?</p>
            <a
              href={'tel:' + contractorPhone.replace(/[^\d+]/g, '')}
              className="mt-2 flex min-h-[3rem] w-full items-center justify-center rounded-milled bg-hazard px-4 font-body text-base font-semibold text-sheet"
            >
              Call {formatUsPhone(contractorPhone)}
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display font-condensed text-xl font-bold">Tell us about your floor</h2>
        <p className="mt-2 text-base">
          {contractorName} prices each job from the details rather than off a chart. Send yours over
          and you&apos;ll have a number back shortly.
        </p>
      </div>

      {contractorPhone ? (
        <a
          href={'tel:' + contractorPhone.replace(/[^\d+]/g, '')}
          className="flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-milled border border-ink bg-sheet px-4 text-base font-semibold"
        >
          Or call {formatUsPhone(contractorPhone)}
        </a>
      ) : null}

      <div className="space-y-3">
        {([
          { k: 'name' as const, label: 'Name', type: 'text', ac: 'name', mode: 'text' as const },
          { k: 'phone' as const, label: 'Phone', type: 'tel', ac: 'tel', mode: 'tel' as const },
          { k: 'email' as const, label: 'Email', type: 'email', ac: 'email', mode: 'email' as const },
        ]).map((f) => (
          <label key={f.k} className="block">
            <span className="font-data text-xs uppercase tracking-wide text-rule">{f.label}</span>
            <input
              type={f.type}
              inputMode={f.mode}
              autoComplete={f.ac}
              value={fields[f.k]}
              onChange={(e) =>
                setFields((s) => ({
                  ...s,
                  [f.k]: f.k === 'phone' ? formatUsPhone(e.target.value) : e.target.value,
                }))
              }
              aria-invalid={showErrors && invalid[f.k]}
              className={
                'mt-1 min-h-[3rem] w-full rounded-milled border bg-sheet px-3 text-base ' +
                (showErrors && invalid[f.k] ? 'border-danger' : 'border-rule')
              }
            />
          </label>
        ))}

        <label className="block">
          <span className="font-data text-xs uppercase tracking-wide text-rule">
            Anything they should know? (optional)
          </span>
          <textarea
            rows={3}
            value={fields.notes}
            onChange={(e) => setFields((s) => ({ ...s, notes: e.target.value }))}
            placeholder="Roughly how big it is, what shape it's in, whether it's been coated before."
            className="mt-1 w-full rounded-milled border border-rule bg-sheet p-3 text-base placeholder:text-rule"
          />
        </label>

        <fieldset>
          <legend className="font-data text-xs uppercase tracking-wide text-rule">
            When do you want it done?
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {TIMELINES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFields((s) => ({ ...s, timeline: t }))}
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
        </fieldset>
      </div>

      {showErrors && anyInvalid ? (
        <p role="alert" className="font-data text-sm text-danger">
          Please fill in your name, phone, email and a timeframe.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-milled border border-danger/40 bg-danger/5 p-3 text-sm">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setShowErrors(true);
          if (!anyInvalid) onSubmit(fields);
        }}
        className="min-h-[3rem] w-full rounded-milled bg-hazard px-4 font-body text-base font-semibold text-sheet disabled:opacity-60"
      >
        {busy ? 'Sending…' : 'Send my details'}
      </button>
    </div>
  );
}
