'use client';

import { useMemo, useState } from 'react';
import { calculateQuote } from '@/lib/quote/pricing';
import {
  REFERENCE_FINISHES,
  REFERENCE_RULES,
  REFERENCE_SQFT_MAX,
  REFERENCE_SQFT_MIN,
  wholeDollars,
} from '@/lib/site/reference-rates';

/**
 * components/site/CalibrationCheck.tsx — THE HERO. The whole page is a frame
 * around this one interaction.
 *
 * He enters the square footage and the price of a job he ALREADY DID, and the
 * live engine produces the range his customer would have been shown. He is not
 * evaluating marketing; he is checking arithmetic against a job he knows the
 * true answer to.
 *
 * THIS CALLS THE REAL ENGINE. lib/quote/pricing.ts, the same module the
 * installed widget calls, priced against a real rules document. It is
 * deliberately isomorphic (see its header), so this runs client-side with no
 * network round trip — which is also why the hero is interactive before any
 * server response and cannot be broken by an outage.
 *
 * DIVERGENCE IS A CREDIBILITY MOMENT, NOT AN ERROR. When his number lands
 * outside the band, the component does not apologise or hide. It shows the
 * itemised breakdown, states the gap in dollars, and says plainly that the
 * reference configuration is Dallas residential defaults while his own install
 * prices from his own rates. A man checking your maths against a job he did is
 * the best possible visitor; the worst response is to treat him as an error
 * state.
 *
 * THE BREAKDOWN IS SELF-VERIFYING. The lines rendered below reproduce the
 * documented order of operations in pricing.ts (coating, prep, additive
 * modifiers on the subtotal, flat mobilisation after the percentages, job
 * minimum, then the band). That reproduction is then CHECKED against the
 * engine's own output: the midpoint implied by the engine's high bound must
 * equal the reconstructed midpoint. If they disagree by more than a rounding
 * cent, the breakdown is withheld and only the engine's range is shown. A
 * breakdown that silently drifts from the engine would be worse than no
 * breakdown at all, and this page cannot afford one wrong number.
 *
 * NOTHING HERE ANIMATES. The figure sets when it is ready. 13A permits the
 * widget's own work to move; it does not require it, and stillness is the
 * register of the whole page.
 */

const SURFACE_TYPE_ID = 'garage';

type Outcome =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | {
      kind: 'priced';
      lowCents: number;
      highCents: number;
      lines: { label: string; note: string; cents: number }[];
      midCents: number;
      breakdownTrustworthy: boolean;
    };

export function CalibrationCheck() {
  const [sqft, setSqft] = useState('');
  const [price, setPrice] = useState('');
  const [tierKey, setTierKey] = useState(REFERENCE_FINISHES[0]!.tierKey);
  const [modifierIds, setModifierIds] = useState<string[]>([]);

  const sqftNum = Number(sqft.replace(/[^0-9.]/g, ''));
  const priceNum = Number(price.replace(/[^0-9.]/g, ''));
  const hasSqft = Number.isFinite(sqftNum) && sqftNum > 0;

  const outcome: Outcome = useMemo(() => {
    if (!hasSqft) return { kind: 'idle' };
    try {
      const computation = calculateQuote(
        {
          sqft: sqftNum,
          surfaceTypeId: SURFACE_TYPE_ID,
          finishTierKey: tierKey,
          conditionModifierIds: modifierIds,
          sqftMin: REFERENCE_SQFT_MIN,
          sqftMax: REFERENCE_SQFT_MAX,
        },
        REFERENCE_RULES
      );

      // Reconstruct the documented order of operations for display.
      const n = Math.round(sqftNum);
      const rate = REFERENCE_RULES.baseRateCentsPerSqft[tierKey]!;
      const coating = Math.round(n * rate);
      const prep = Math.round(n * REFERENCE_RULES.prepRateCentsPerSqft);
      const subtotal = coating + prep;

      const lines: { label: string; note: string; cents: number }[] = [
        {
          label: 'Coating material and application',
          note: `${n.toLocaleString('en-US')} sqft × $${(rate / 100).toFixed(2)}`,
          cents: coating,
        },
      ];
      if (prep > 0) {
        lines.push({
          label: 'Surface preparation',
          note: `${n.toLocaleString('en-US')} sqft × $${(
            REFERENCE_RULES.prepRateCentsPerSqft / 100
          ).toFixed(2)}`,
          cents: prep,
        });
      }

      let modifierTotal = 0;
      for (const id of modifierIds) {
        const mod = REFERENCE_RULES.conditionModifiers.find((m) => m.id === id);
        if (!mod) continue;
        const cents = Math.round(subtotal * mod.pctAdjust);
        modifierTotal += cents;
        lines.push({
          label: mod.label,
          note: `${mod.pctAdjust > 0 ? '+' : ''}${Math.round(mod.pctAdjust * 100)}% of subtotal`,
          cents,
        });
      }

      if (REFERENCE_RULES.mobilizationFeeCents > 0) {
        lines.push({
          label: 'Mobilisation',
          note: 'flat, after the percentages',
          cents: REFERENCE_RULES.mobilizationFeeCents,
        });
      }

      const total = subtotal + modifierTotal + REFERENCE_RULES.mobilizationFeeCents;
      const midCents = Math.max(total, REFERENCE_RULES.minimumJobCents);

      // Self-check against the engine. high = mid × (1 + spread).
      const impliedMid = Math.round(
        computation.highCents / (1 + REFERENCE_RULES.rangeSpreadPct)
      );
      const breakdownTrustworthy = Math.abs(impliedMid - midCents) <= 2;

      return {
        kind: 'priced',
        lowCents: computation.lowCents,
        highCents: computation.highCents,
        lines,
        midCents,
        breakdownTrustworthy,
      };
    } catch {
      // Deliberately does not read any field off PricingError. The bounds are
      // known here, so the out-of-range case is decided from the input rather
      // than from the error's shape — one less thing coupled to the kernel.
      const outOfBounds = sqftNum < REFERENCE_SQFT_MIN || sqftNum > REFERENCE_SQFT_MAX;
      return {
        kind: 'error',
        message: outOfBounds
          ? `This reference configuration is set to ${REFERENCE_SQFT_MIN.toLocaleString(
              'en-US'
            )}–${REFERENCE_SQFT_MAX.toLocaleString(
              'en-US'
            )} sqft. Yours would be set to your own range.`
          : 'That combination is not priced by this configuration.',
      };
    }
  }, [hasSqft, sqftNum, tierKey, modifierIds]);

  const toggleModifier = (id: string) =>
    setModifierIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const priceCents = Number.isFinite(priceNum) && priceNum > 0 ? Math.round(priceNum * 100) : null;
  const inBand =
    outcome.kind === 'priced' && priceCents !== null
      ? priceCents >= outcome.lowCents && priceCents <= outcome.highCents
      : null;

  return (
    <div className="border border-rule bg-sheet">
      {/* INPUTS — the panel. Machine Black, because this is chrome, not
          information. Information is the Ticket White document below it. */}
      <div className="bg-ink px-4 py-4 text-sheet sm:px-5">
        <label className="block" htmlFor="cal-sqft">
          <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
            Square feet on that job
          </span>
          <input
            id="cal-sqft"
            inputMode="numeric"
            autoComplete="off"
            value={sqft}
            onChange={(e) => setSqft(e.target.value)}
            placeholder="480"
            className="mt-1 w-full rounded-none border border-rule bg-ink px-3 py-3 font-data text-lg tabular text-sheet placeholder:text-rule"
          />
        </label>

        <fieldset className="mt-4">
          <legend className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
            Finish you installed
          </legend>
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {REFERENCE_FINISHES.map((f) => {
              const on = f.tierKey === tierKey;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTierKey(f.tierKey)}
                  aria-pressed={on}
                  className={`press rounded-milled border px-2 py-2.5 text-sm ${
                    on
                      ? 'border-hazard bg-hazard text-sheet'
                      : 'border-rule bg-ink text-sheet'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-4">
          <legend className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
            Condition of the slab
          </legend>
          <div className="mt-1 flex flex-col gap-1.5">
            {REFERENCE_RULES.conditionModifiers.map((m) => {
              const on = modifierIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleModifier(m.id)}
                  aria-pressed={on}
                  className={`press flex items-center justify-between rounded-milled border px-3 py-2.5 text-left text-sm ${
                    on ? 'border-hazard bg-hazard text-sheet' : 'border-rule bg-ink text-sheet'
                  }`}
                >
                  <span>{m.label}</span>
                  <span className="font-data text-2xs tabular">
                    +{Math.round(m.pctAdjust * 100)}%
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="mt-4 block" htmlFor="cal-price">
          <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
            What you charged for it (optional)
          </span>
          <input
            id="cal-price"
            inputMode="numeric"
            autoComplete="off"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="3800"
            className="mt-1 w-full rounded-none border border-rule bg-ink px-3 py-3 font-data text-lg tabular text-sheet placeholder:text-rule"
          />
        </label>
      </div>

      {/* OUTPUT — Ticket White, because a figure is on it. */}
      <div className="bg-sheet px-4 py-4 sm:px-5">
        {outcome.kind === 'idle' && (
          <p className="text-sm text-rule">
            Put in the square footage of a floor you have already done. The range below is what
            your customer would have seen on your website.
          </p>
        )}

        {outcome.kind === 'error' && <p className="text-sm">{outcome.message}</p>}

        {outcome.kind === 'priced' && (
          <>
            <p className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
              Quoted range
            </p>
            <p className="mt-1 font-data text-2xl tabular leading-tight text-ink">
              {wholeDollars(outcome.lowCents)} – {wholeDollars(outcome.highCents)}
            </p>

            {priceCents !== null && (
              <div className="mt-3 border-t border-rule pt-3">
                <p className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                  Against your {wholeDollars(priceCents)}
                </p>
                {inBand ? (
                  <p className="mt-1 font-data text-base tabular text-cure">IN RANGE</p>
                ) : (
                  <p className="mt-1 text-sm">
                    <span className="font-data tabular">
                      {priceCents > outcome.highCents ? 'ABOVE' : 'BELOW'} BY{' '}
                      {wholeDollars(
                        priceCents > outcome.highCents
                          ? priceCents - outcome.highCents
                          : outcome.lowCents - priceCents
                      )}
                    </span>{' '}
                    — the breakdown below shows every line that made this number. These are Dallas
                    residential defaults. Your install prices from your rates, which you set.
                  </p>
                )}
              </div>
            )}

            {outcome.breakdownTrustworthy && (
              <table className="mt-3 w-full border-t border-rule text-sm">
                <caption className="sr-only">Itemised breakdown</caption>
                <tbody>
                  {outcome.lines.map((l) => (
                    <tr key={l.label} className="border-b border-rule">
                      <td className="py-2 pr-3 align-top">
                        {l.label}
                        <span className="block font-data text-2xs uppercase tracking-[0.08em] text-rule">
                          {l.note}
                        </span>
                      </td>
                      <td className="py-2 text-right align-top font-data tabular">
                        {wholeDollars(l.cents)}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 pr-3 font-data text-2xs uppercase tracking-[0.08em] text-rule">
                      Midpoint
                      {outcome.midCents === REFERENCE_RULES.minimumJobCents && (
                        <span className="block normal-case tracking-normal">
                          raised to the job minimum
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right font-data tabular">
                      {wholeDollars(outcome.midCents)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-data text-2xs uppercase tracking-[0.08em] text-rule">
                      Band ±{Math.round(REFERENCE_RULES.rangeSpreadPct * 100)}%
                    </td>
                    <td className="py-2 text-right font-data tabular">
                      {wholeDollars(outcome.lowCents)} – {wholeDollars(outcome.highCents)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
