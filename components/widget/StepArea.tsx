'use client';

import { useState } from 'react';
import { DatumRule } from './DatumRule';
import { PriceSpan } from './PriceSpan';
import type { QuoteComputation } from '@/lib/quote/pricing';

/**
 * STEP 3 — the price calculator.
 *
 * The slider IS the datum rule, and the price IS a span drawn on the same
 * scale. That single decision is what stops this looking like every other
 * estimate widget: area and price are read off one instrument instead of
 * living in two unrelated boxes.
 *
 * THE BREAKDOWN IS OPEN BY DEFAULT ON REQUEST, not hidden behind a chevron
 * that most people never touch. Transparency is the thing that makes a
 * contractor trust the tool enough to put it on his own site — he needs to see
 * that the number came from HIS rates, not from us.
 */

export interface StepAreaProps {
  sqft: number;
  sqftMin: number;
  sqftMax: number;
  onSqftChange: (v: number) => void;
  typicalSqft: { label: string; sqft: number }[];
  computation: QuoteComputation | null;
  modifiers: { id: string; label: string; active: boolean }[];
  onToggleModifier: (id: string) => void;
  onContinue: () => void;
  /** Phase 5: fired when a "not sure?" helper chip sets the value (EVENTS.md sqft_changed). */
  onHelperPick?: (sqft: number) => void;
  /** Phase 5: fired when the breakdown table is opened (EVENTS.md breakdown_expanded). */
  onExpandBreakdown?: () => void;
}

export function StepArea({
  sqft,
  sqftMin,
  sqftMax,
  onSqftChange,
  typicalSqft,
  computation,
  modifiers,
  onToggleModifier,
  onContinue,
  onHelperPick,
  onExpandBreakdown,
}: StepAreaProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showHelper, setShowHelper] = useState(false);

  return (
    <div className="space-y-5">
      <h2 className="font-display font-condensed text-xl font-bold">How big is the floor?</h2>

      <DatumRule
        min={sqftMin}
        max={sqftMax}
        value={sqft}
        onChange={onSqftChange}
        label="Area"
      />

      <div>
        <button
          type="button"
          onClick={() => setShowHelper((v) => !v)}
          aria-expanded={showHelper}
          className="font-data text-sm text-rule underline underline-offset-4 hover:text-ink"
        >
          Not sure?
        </button>
        {showHelper ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {typicalSqft.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => {
                  onSqftChange(t.sqft);
                  onHelperPick?.(t.sqft);
                  setShowHelper(false);
                }}
                className="min-h-[2.75rem] rounded-milled border border-rule bg-sheet px-3 text-sm hover:border-ink"
              >
                {t.label}
                <span className="tabular ml-2 font-data text-xs text-rule">{t.sqft} sq ft</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {modifiers.length > 0 ? (
        <fieldset>
          <legend className="font-data text-xs uppercase tracking-wide text-rule">
            Anything else about the floor?
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {modifiers.map((mod) => (
              <button
                key={mod.id}
                type="button"
                onClick={() => onToggleModifier(mod.id)}
                aria-pressed={mod.active}
                className={
                  'min-h-[2.75rem] rounded-milled border px-3 text-sm transition-colors duration-step ' +
                  (mod.active ? 'border-ink bg-ink text-sheet' : 'border-rule bg-sheet text-ink')
                }
              >
                {mod.label}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {computation ? (
        <div className="border-t pt-4">
          <PriceSpan lowCents={computation.lowCents} highCents={computation.highCents} />

          <button
            type="button"
            onClick={() =>
              setShowBreakdown((v) => {
                if (!v) onExpandBreakdown?.();
                return !v;
              })
            }
            aria-expanded={showBreakdown}
            className="mt-2 font-data text-sm text-rule underline underline-offset-4 hover:text-ink"
          >
            {showBreakdown ? 'Hide the breakdown' : 'See how this is calculated'}
          </button>

          {showBreakdown ? (
            <table className="mt-3 w-full border-collapse font-data text-sm">
              <tbody>
                {computation.lines.map((l) => (
                  <tr key={l.id} className="border-b border-rule/40">
                    <td className="py-1.5 pr-2 text-ink">
                      {l.label}
                      {l.detail && 'sqft' in l.detail ? (
                        <span className="tabular ml-1 text-rule">
                          {l.detail.sqft} sq ft × ${(l.detail.rateCentsPerSqft / 100).toFixed(2)}
                        </span>
                      ) : null}
                      {l.detail && 'pctAdjust' in l.detail ? (
                        <span className="tabular ml-1 text-rule">
                          {l.detail.pctAdjust > 0 ? '+' : ''}
                          {Math.round(l.detail.pctAdjust * 100)}%
                        </span>
                      ) : null}
                    </td>
                    <td className="tabular py-1.5 text-right text-ink">
                      ${Math.round(l.cents / 100).toLocaleString('en-US')}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1.5 font-data text-xs uppercase tracking-wide text-rule">
                    Range is ±{Math.round(computation.rangeSpreadPct * 100)}% of the midpoint
                  </td>
                  <td className="tabular py-1.5 text-right font-semibold">
                    ${Math.round(computation.midpointCents / 100).toLocaleString('en-US')}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : null}

          <button
            type="button"
            onClick={onContinue}
            className="mt-5 min-h-[3rem] w-full rounded-milled bg-hazard px-4 font-body text-base font-semibold text-sheet transition-colors duration-step hover:bg-hazard/90"
          >
            Get this quote
          </button>
        </div>
      ) : null}
    </div>
  );
}
