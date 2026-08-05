'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { scoreProspect, type ScorecardInput, type QualificationBand } from '@/lib/prospects/scorecard';
import { upsertProspectAction } from '@/app/actions/prospects';
import type { ProspectStatus } from '@/types';
import { getRegisteredVerticals } from '@/lib/verticals/manifest';

/**
 * components/admin/ProspectForm.tsx — the qualification scorecard as a
 * LIVE form. Score and warning recompute on every keystroke using the exact
 * same pure scoreProspect() the server calls at save time — not a second
 * approximation, the identical function, imported directly. What gets
 * stored on save is whatever this preview showed; there is no gap between
 * what the admin saw and what gets written.
 *
 * 360PX FIRST: single column throughout, no side-by-side layout, every
 * touch target at least 44px tall — this gets used mid-sales-call.
 */

/**
 * PHASE 11. Read from the registry rather than hardcoded, so this list can
 * never disagree with what the product can actually build. A vertical that is
 * not registered cannot be staged — which is the correct failure: it means the
 * admin can only sell what the widget can quote.
 *
 * Computed at module scope, once. getRegisteredVerticals() is pure and the
 * registry does not change at runtime, so there is nothing to recompute per
 * render and nothing to put in state.
 */
const VERTICAL_OPTIONS = getRegisteredVerticals().map((v) => ({
  id: v.id,
  label: v.copy.adminVerticalLabel,
  tradeNoun: v.copy.tradeNoun,
}));

const BAND_STYLE: Record<QualificationBand, string> = {
  strong: 'border-cure/40 bg-cure/5 text-cure',
  workable: 'border-rule bg-sheet text-ink',
  weak: 'border-warning/40 bg-warning/5 text-warning',
  decline: 'border-danger/40 bg-danger/5 text-danger',
};

export interface ProspectFormValues {
  id?: string;
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  websiteUrl: string;
  vertical: string;
  qualificationNotes: string;
  status: ProspectStatus;
  scorecard: ScorecardInput;
}

const EMPTY: ProspectFormValues = {
  businessName: '', contactName: '', phone: '', email: '', city: '', state: '', websiteUrl: '',
  vertical: VERTICAL_OPTIONS[0]?.id ?? 'epoxy', qualificationNotes: '', status: 'new',
  scorecard: {
    hasGoogleAds: false, googleReviewCount: 0, searchRank: 'unknown',
    estimatedMonthlyTraffic: 0, hasQuoteOrPricingTool: null, siteLooksAbandoned: null,
  },
};

export function ProspectForm({ initial }: { initial?: ProspectFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState<ProspectFormValues>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(() => scoreProspect(values.scorecard), [values.scorecard]);

  function setScorecard<K extends keyof ScorecardInput>(key: K, value: ScorecardInput[K]) {
    setValues((v) => ({ ...v, scorecard: { ...v.scorecard, [key]: value } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await upsertProspectAction({
      id: values.id,
      businessName: values.businessName,
      contactName: values.contactName,
      phone: values.phone,
      email: values.email,
      city: values.city,
      state: values.state,
      websiteUrl: values.websiteUrl,
      vertical: values.vertical,
      scorecard: values.scorecard,
      qualificationNotes: values.qualificationNotes,
      status: values.status,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not save.');
      return;
    }
    router.push('/admin/prospects/' + res.id);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* THE LIVE VERDICT — always visible, above the fields that drive it */}
      <div className={'rounded-milled border p-4 ' + BAND_STYLE[result.band]}>
        <p className="font-data text-xs uppercase tracking-wide opacity-70">
          {result.band === 'strong' ? 'Good fit' : result.band === 'workable' ? 'Workable' : result.band === 'weak' ? 'Weak fit' : 'Do not sell'}
        </p>
        <p className="mt-1 text-base font-medium leading-snug">{result.warning}</p>
        <p className="mt-2 font-data text-sm opacity-80">{result.action}</p>
      </div>

      <fieldset className="space-y-3">
        <legend className="font-data text-xs uppercase tracking-wide text-rule">Business</legend>

        <div className="space-y-2">
          <span id="vertical-label" className="block font-data text-xs uppercase tracking-wide text-rule">
            Trade
          </span>
          <div className="space-y-2" role="radiogroup" aria-labelledby="vertical-label">
            {VERTICAL_OPTIONS.map((v) => {
              const active = v.id === values.vertical;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setValues((s) => ({ ...s, vertical: v.id }))}
                  className={
                    'block min-h-[3rem] w-full rounded-milled border px-4 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
                    (active ? 'border-hazard bg-hazard text-sheet' : 'border-rule bg-sheet text-ink')
                  }
                >
                  <span className="block font-body text-base font-semibold">{v.label}</span>
                  <span className={'block font-data text-xs ' + (active ? 'text-sheet/80' : 'text-rule')}>
                    {v.tradeNoun}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="font-data text-xs text-rule">
            Sets which quoting widget gets staged. It can be changed until the prototype is built.
          </p>
        </div>

        <Field label="Business name" value={values.businessName} onChange={(v) => setValues((s) => ({ ...s, businessName: v }))} required />
        <Field label="Contact name" value={values.contactName} onChange={(v) => setValues((s) => ({ ...s, contactName: v }))} />
        <Field label="Phone" type="tel" value={values.phone} onChange={(v) => setValues((s) => ({ ...s, phone: v }))} />
        <Field label="Email" type="email" value={values.email} onChange={(v) => setValues((s) => ({ ...s, email: v }))} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" value={values.city} onChange={(v) => setValues((s) => ({ ...s, city: v }))} />
          <Field label="State" value={values.state} onChange={(v) => setValues((s) => ({ ...s, state: v }))} />
        </div>
        <Field label="Website" type="url" value={values.websiteUrl} onChange={(v) => setValues((s) => ({ ...s, websiteUrl: v }))} />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-data text-xs uppercase tracking-wide text-rule">Qualification signals</legend>

        <ToggleRow
          label="Running Google Ads on epoxy/coating terms"
          checked={values.scorecard.hasGoogleAds}
          onChange={(v) => setScorecard('hasGoogleAds', v)}
        />

        <NumberField
          label="Google review count"
          value={values.scorecard.googleReviewCount}
          onChange={(v) => setScorecard('googleReviewCount', v)}
        />

        <SelectField
          label={'Ranks for "epoxy garage floor [city]"'}
          value={values.scorecard.searchRank}
          onChange={(v) => setScorecard('searchRank', v as ScorecardInput['searchRank'])}
          options={[
            { value: 'unknown', label: 'Not checked yet' },
            { value: 'page_1', label: 'Page 1' },
            { value: 'page_2', label: 'Page 2' },
            { value: 'not_ranking', label: 'Not ranking' },
          ]}
        />

        <NumberField
          label="Estimated monthly site visitors"
          value={values.scorecard.estimatedMonthlyTraffic}
          onChange={(v) => setScorecard('estimatedMonthlyTraffic', v)}
        />

        <TriStateRow
          label="Site already has a quote form or pricing"
          value={values.scorecard.hasQuoteOrPricingTool}
          onChange={(v) => setScorecard('hasQuoteOrPricingTool', v)}
        />

        <TriStateRow
          label="Site looks dead, parked, or 3+ years stale"
          value={values.scorecard.siteLooksAbandoned}
          onChange={(v) => setScorecard('siteLooksAbandoned', v)}
        />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-data text-xs uppercase tracking-wide text-rule">Notes &amp; status</legend>
        <label className="block">
          <span className="font-data text-xs uppercase tracking-wide text-rule">Notes</span>
          <textarea
            rows={3}
            value={values.qualificationNotes}
            onChange={(e) => setValues((s) => ({ ...s, qualificationNotes: e.target.value }))}
            className="mt-1 w-full rounded-milled border border-rule bg-sheet p-3 text-base"
            placeholder="Why this score, anything worth remembering before the call."
          />
        </label>
        <SelectField
          label="Status"
          value={values.status}
          onChange={(v) => setValues((s) => ({ ...s, status: v as ProspectStatus }))}
          options={[
            { value: 'new', label: 'New' },
            { value: 'qualified', label: 'Qualified' },
            { value: 'pitched', label: 'Pitched' },
            { value: 'customer', label: 'Customer' },
            { value: 'declined', label: 'Declined' },
            { value: 'churned', label: 'Churned' },
          ]}
        />
      </fieldset>

      {error ? (
        <p role="alert" className="rounded-milled border border-danger/40 bg-danger/5 p-3 text-sm">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="min-h-[3rem] w-full rounded-milled bg-hazard px-4 font-body text-base font-semibold text-sheet disabled:opacity-60"
      >
        {busy ? 'Saving…' : values.id ? 'Save changes' : 'Create prospect'}
      </button>
    </form>
  );
}

function Field({
  label, value, onChange, type = 'text', required = false,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="font-data text-xs uppercase tracking-wide text-rule">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 min-h-[3rem] w-full rounded-milled border border-rule bg-sheet px-3 text-base"
      />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="font-data text-xs uppercase tracking-wide text-rule">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="tabular mt-1 min-h-[3rem] w-full rounded-milled border border-rule bg-sheet px-3 text-base"
      />
    </label>
  );
}

function SelectField({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="font-data text-xs uppercase tracking-wide text-rule">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 min-h-[3rem] w-full rounded-milled border border-rule bg-sheet px-3 text-base"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={
        'flex min-h-[3rem] w-full items-center justify-between rounded-milled border px-3 text-left text-base transition-colors duration-step ' +
        (checked ? 'border-ink bg-ink text-sheet' : 'border-rule bg-sheet')
      }
    >
      <span>{label}</span>
      <span className="font-data text-xs uppercase">{checked ? 'Yes' : 'No'}</span>
    </button>
  );
}

/** true / false / null (not yet assessed) — three states, three taps. */
function TriStateRow({
  label, value, onChange,
}: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <div>
      <span className="font-data text-xs uppercase tracking-wide text-rule">{label}</span>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {([
          { v: null, label: 'Not sure' },
          { v: false, label: 'No' },
          { v: true, label: 'Yes' },
        ] as const).map((opt) => (
          <button
            key={String(opt.v)}
            type="button"
            onClick={() => onChange(opt.v)}
            aria-pressed={value === opt.v}
            className={
              'min-h-[2.75rem] rounded-milled border text-sm transition-colors duration-step ' +
              (value === opt.v ? 'border-ink bg-ink text-sheet' : 'border-rule bg-sheet')
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
