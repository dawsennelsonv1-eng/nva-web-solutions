'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { buildRulesForm, applyRulesForm, type RuleField, type ModifierField } from '@/lib/admin/rulesForm';
import { saveQuoteConfigAction, type QuoteConfigDetail } from '@/app/actions/quoteConfig';

/**
 * components/admin/QuoteConfigForm.tsx — the screen a rate change happens on.
 *
 * THE FIELD LIST IS NOT WRITTEN DOWN ANYWHERE. It is derived from the saved
 * rules document by lib/admin/rulesForm.ts, so this component works for epoxy,
 * for painting, and for a vertical that ships next month, without being
 * edited. See that file for why it walks the document rather than the schema.
 *
 * MONEY IS TYPED IN DOLLARS AND STORED IN CENTS. The conversion is at the form
 * boundary only. A contractor telling you "five fifty a square foot" types
 * 5.50, and 550 is what lands in the database.
 *
 * THE SAVE CAN BE REFUSED BY THE VERTICAL. saveQuoteConfigAction validates
 * against the module's own `.strict()` schema and returns the schema's own
 * complaint. That message is rendered verbatim rather than replaced with
 * "Something went wrong" — the person reading it is the operator, and
 * "conditionModifiers.0.pctAdjust: Number must be less than or equal to 1" is
 * the sentence that tells him he typed 18 where he meant 0.18.
 *
 * NO OPTIMISTIC UI. The form does not clear, reset, or navigate on save. It
 * states the outcome and leaves every value where it is, because the operator's
 * next action after changing a rate is usually to change another one, and
 * because a rates screen that appears to have saved when it has not is the
 * worst possible failure mode on this particular table.
 */

export function QuoteConfigForm({ config }: { config: QuoteConfigDetail }) {
  const initial = buildRulesForm(config.rules);

  const [fields, setFields] = useState<RuleField[]>(initial.fields);
  const [modifiers, setModifiers] = useState<ModifierField[]>(initial.modifiers);
  const [sqftMin, setSqftMin] = useState(String(config.sqftMin));
  const [sqftMax, setSqftMax] = useState(String(config.sqftMax));
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const setField = (path: string, display: string) =>
    setFields((cur) => cur.map((f) => (f.path === path ? { ...f, display } : f)));

  const setModifier = (index: number, patch: Partial<ModifierField>) =>
    setModifiers((cur) => cur.map((m) => (m.index === index ? { ...m, ...patch } : m)));

  const addModifier = () =>
    setModifiers((cur) => [
      ...cur,
      { index: cur.length === 0 ? 0 : Math.max(...cur.map((m) => m.index)) + 1, id: '', label: '', pctDisplay: '0' },
    ]);

  const save = () => {
    setOutcome(null);
    const built = applyRulesForm(config.rules, fields, modifiers, initial.hasModifiers);
    if ('error' in built) {
      setOutcome({ ok: false, message: built.error });
      return;
    }
    const min = Number(sqftMin);
    const max = Number(sqftMax);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      setOutcome({ ok: false, message: 'Area bounds must be numbers.' });
      return;
    }

    startTransition(async () => {
      const result = await saveQuoteConfigAction({
        id: config.id,
        rules: built.rules,
        sqftMin: Math.round(min),
        sqftMax: Math.round(max),
      });
      setOutcome(
        result.ok
          ? { ok: true, message: 'Saved. Every quote from now on prices from these rates.' }
          : { ok: false, message: result.error ?? 'The save was refused.' }
      );
    });
  };

  if (!config.verticalRegistered) {
    return (
      <div className="rounded-milled border bg-sheet p-4">
        <p className="text-base">
          The <span className="font-data">{config.vertical}</span> module is not registered, so
          these rules cannot be validated before saving.
        </p>
        <p className="mt-2 text-sm text-rule">
          Editing is disabled rather than unvalidated. Register the vertical in
          lib/verticals/manifest.ts and this screen works.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-milled border bg-sheet p-4">
        <p className="font-data text-xs uppercase tracking-wide text-rule">Rates</p>
        <p className="mt-1 text-sm text-rule">
          Money is entered in dollars. Percentages are entered as whole numbers — 15 means ±15%.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <Field
              key={f.path}
              id={`rule-${f.path}`}
              label={
                config.finishLabels[f.path.split('.').pop() ?? ''] ??
                `${f.label}${f.unit === 'cents' ? ' ($)' : f.unit === 'pct' ? ' (%)' : ''}`
              }
              inputMode="decimal"
              value={f.display}
              onChange={(e) => setField(f.path, e.target.value)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-milled border bg-sheet p-4">
        <p className="font-data text-xs uppercase tracking-wide text-rule">Area bounds</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            id="sqft-min"
            label="Minimum area"
            inputMode="numeric"
            value={sqftMin}
            onChange={(e) => setSqftMin(e.target.value)}
          />
          <Field
            id="sqft-max"
            label="Maximum area"
            inputMode="numeric"
            value={sqftMax}
            onChange={(e) => setSqftMax(e.target.value)}
          />
        </div>
      </section>

      {initial.hasModifiers && (
        <section className="rounded-milled border bg-sheet p-4">
          <p className="font-data text-xs uppercase tracking-wide text-rule">Condition modifiers</p>
          <p className="mt-1 text-sm text-rule">
            Percent of the subtotal, added rather than compounded. Clear both text fields to remove
            a row. The id is what a saved quote refers to — changing it on a live config orphans
            the modifier on quotes already written.
          </p>
          <div className="mt-4 space-y-3">
            {modifiers.map((m) => (
              <div key={m.index} className="grid gap-2 sm:grid-cols-[1fr_1fr_120px]">
                <Field
                  id={`mod-id-${m.index}`}
                  label="Id"
                  value={m.id}
                  onChange={(e) => setModifier(m.index, { id: e.target.value })}
                />
                <Field
                  id={`mod-label-${m.index}`}
                  label="Label"
                  value={m.label}
                  onChange={(e) => setModifier(m.index, { label: e.target.value })}
                />
                <Field
                  id={`mod-pct-${m.index}`}
                  label="Percent"
                  inputMode="decimal"
                  value={m.pctDisplay}
                  onChange={(e) => setModifier(m.index, { pctDisplay: e.target.value })}
                />
              </div>
            ))}
          </div>
          <Button type="button" onClick={addModifier} className="mt-3">
            Add a modifier
          </Button>
        </section>
      )}

      {outcome && (
        <p className={`text-base ${outcome.ok ? 'text-cure' : 'text-danger'}`}>{outcome.message}</p>
      )}

      <Button type="button" variant="hazard" onClick={save} disabled={pending}>
        {pending ? 'Saving…' : 'Save rates'}
      </Button>
    </div>
  );
}
