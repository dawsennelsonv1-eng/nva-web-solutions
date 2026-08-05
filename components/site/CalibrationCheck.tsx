'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DatumRule } from '@/components/widget/DatumRule';
import { CountingFigure } from '@/components/site/CountingFigure';
import { FinishPhoto } from '@/components/site/FinishPhoto';
import { calculateQuote } from '@/lib/quote/pricing';
import { finishPhotoFor } from '@/lib/site/finish-photos';
import {
  BASE_RATES,
  DEFAULT_TIER,
  REFERENCE_FINISHES,
  REFERENCE_RULES,
  REFERENCE_SQFT_MAX,
  REFERENCE_SQFT_MIN,
  wholeDollars,
  type TierKey,
} from '@/lib/site/reference-rates';

/**
 * components/site/CalibrationCheck.tsx — THE HERO. The whole page is a frame
 * around this one interaction.
 *
 * He sets the square footage of a job he ALREADY DID, picks the finish he
 * installed, and the live engine produces the range his customer would have
 * been shown. He is not evaluating marketing; he is checking arithmetic
 * against a job he knows the true answer to.
 *
 * THIS CALLS THE REAL ENGINE. lib/quote/pricing.ts, the same module the
 * installed widget calls, priced against a real rules document. It is
 * deliberately isomorphic (see its header), so this runs client-side with no
 * network round trip — which is also why the hero is interactive before any
 * server response and cannot be broken by an outage.
 *
 * ============================================================================
 * WHAT 13D CHANGED, AND WHY 13B WAS WRONG ABOUT IT
 * ============================================================================
 *
 * The 13B version of this file ended its header with: "NOTHING HERE ANIMATES.
 * The figure sets when it is ready." That was a defensible reading of 13A —
 * 13A permits the widget's own work to move but does not require it — and it
 * produced a hero that was correct, honest, and completely inert.
 *
 * Inert is affordable when traffic arrives having already decided to evaluate
 * you. It is not affordable when traffic arrives from a paid feed, where the
 * decision to stop scrolling is made in under a second and is made on
 * movement. The governing rule of this phase resolves the tension without
 * reverting to generic:
 *
 *     MOTION IS PERMITTED WHERE IT DEMONSTRATES THE PRODUCT.
 *     MOTION IS BANNED WHERE IT DECORATES.
 *
 * Every moving thing below is the pricing engine doing its job in public. The
 * page around this component still does not move, and nothing here observes
 * scroll.
 *
 * FOUR CHANGES:
 *
 *  1. THE SQUARE-FOOTAGE INPUT IS NOW THE DATUM RULE. It was a text field.
 *     A text field cannot be dragged, and a number that only changes when you
 *     finish typing cannot demonstrate anything. It is now the same graduated
 *     scale the installed widget uses — which also means the hero is now
 *     literally the product rather than a reproduction of it.
 *
 *  2. THE FIGURES COUNT. See CountingFigure for why they sometimes must not.
 *
 *  3. THE BREAKDOWN IS UNCONDITIONAL. 13B rendered it only when the engine's
 *     self-check passed AND, in practice, only once he had typed something.
 *     Watching the math assemble IS the demonstration, so it is visible from
 *     first paint with the default job already priced.
 *
 *  4. FINISH PHOTOGRAPHS. Three buttons reading "Decorative flakes",
 *     "Metallic epoxy", "Solid polyaspartic" ask a contractor to pick from
 *     text when the thing he is picking is a LOOK. See finish-photos.ts for
 *     the honesty constraint on what these images may claim.
 *
 * ============================================================================
 * DIVERGENCE IS A CREDIBILITY MOMENT, NOT AN ERROR
 * ============================================================================
 *
 * When his own number lands outside the band, this does not apologise or hide.
 * It states the gap in dollars and says plainly that the reference
 * configuration is Dallas residential defaults while his own install prices
 * from his own rates. A man checking your maths against a job he did is the
 * best possible visitor; the worst response is to treat him as an error state.
 *
 * ============================================================================
 * THE BREAKDOWN IS SELF-VERIFYING — UNCHANGED FROM 13B, DELIBERATELY
 * ============================================================================
 *
 * The lines below reproduce the documented order of operations in pricing.ts
 * (coating, prep, additive modifiers on the subtotal, flat mobilisation after
 * the percentages, job minimum, then the band). That reproduction is then
 * CHECKED against the engine's own output: the midpoint implied by the
 * engine's high bound must equal the reconstructed midpoint. If they disagree
 * by more than a rounding cent the breakdown is withheld and only the range is
 * shown.
 *
 * Making the breakdown visible by default RAISES the stakes on that check
 * rather than lowering them, so it stays exactly as it was. A breakdown that
 * silently drifts from the engine would be worse than no breakdown at all, and
 * it is now the first thing on the page.
 */

const SURFACE_TYPE_ID = 'garage';

/**
 * 480 sqft — a two-car garage, the middle typical dimension in
 * lib/verticals/epoxy. The instrument opens ON a real job rather than at zero,
 * so the first thing he sees is a complete assembled quote he can immediately
 * disagree with. An empty state would waste the only second this page gets.
 */
const DEFAULT_SQFT = 480;

interface Line {
  id: string;
  label: string;
  note: string;
  cents: number;
}

type Outcome =
  | { kind: 'error'; message: string }
  | {
      kind: 'priced';
      lowCents: number;
      highCents: number;
      lines: Line[];
      midCents: number;
      breakdownTrustworthy: boolean;
    };

export function CalibrationCheck() {
  const [sqft, setSqft] = useState(DEFAULT_SQFT);
  const [tierKey, setTierKey] = useState<TierKey>(DEFAULT_TIER);
  const [modifierIds, setModifierIds] = useState<string[]>([]);
  const [price, setPrice] = useState('');

  /** False only while the rule is under a thumb. See CountingFigure. */
  const [animate, setAnimate] = useState(true);

  /** Which breakdown lines just moved, and a nonce to retrigger the flash. */
  const [flash, setFlash] = useState<{ nonce: number; ids: string[] }>({
    nonce: 0,
    ids: [],
  });

  /**
   * DRAG COALESCING. A range input fires many times per frame on a fast drag.
   * Committing each one to React state would run the pricing kernel — which
   * includes a zod parse of the rules document — and reconcile the whole
   * breakdown table several times between two paints, for one visible result.
   *
   * So input events land in a ref and at most ONE state commit is scheduled
   * per animation frame. DatumRule is already writing its own readout and
   * indicator straight to the DOM on every event, so the scale under his thumb
   * stays exact regardless; this only governs how often the PRICE recomputes,
   * which is once per frame, which is as often as a screen can show it.
   */
  const pendingSqft = useRef(DEFAULT_SQFT);
  const rafId = useRef(0);

  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  const onSqftChange = useCallback((v: number) => {
    pendingSqft.current = v;
    if (rafId.current) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0;
      setAnimate(false);
      setSqft(pendingSqft.current);
    });
  }, []);

  const flashLines = useCallback((ids: string[]) => {
    setFlash((f) => ({ nonce: f.nonce + 1, ids }));
  }, []);

  /**
   * Choosing a finish changes the coating rate, which changes the subtotal,
   * which changes every percentage modifier resting on that subtotal. All of
   * those lines genuinely moved, so all of them are marked. Marking only the
   * coating line would be the tidier animation and the less true one.
   */
  const chooseFinish = (k: TierKey) => {
    if (k === tierKey) return;
    setAnimate(true);
    setTierKey(k);
    flashLines(['coating', ...modifierIds]);
  };

  const toggleModifier = (id: string) => {
    setAnimate(true);
    setModifierIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    flashLines([id]);
  };

  const outcome: Outcome = useMemo(() => {
    try {
      const computation = calculateQuote(
        {
          sqft,
          surfaceTypeId: SURFACE_TYPE_ID,
          finishTierKey: tierKey,
          conditionModifierIds: modifierIds,
          sqftMin: REFERENCE_SQFT_MIN,
          sqftMax: REFERENCE_SQFT_MAX,
        },
        REFERENCE_RULES
      );

      // Reconstruct the documented order of operations for display.
      const n = Math.round(sqft);
      // BASE_RATES, not REFERENCE_RULES.baseRateCentsPerSqft: the latter is a
      // Record<string, number> and yields number | undefined under
      // noUncheckedIndexedAccess. Same numbers, exact keys.
      const rate = BASE_RATES[tierKey];
      const coating = Math.round(n * rate);
      const prep = Math.round(n * REFERENCE_RULES.prepRateCentsPerSqft);
      const subtotal = coating + prep;

      const lines: Line[] = [
        {
          id: 'coating',
          label: 'Coating material and application',
          note: `${n.toLocaleString('en-US')} sqft × $${(rate / 100).toFixed(2)}`,
          cents: coating,
        },
      ];
      if (prep > 0) {
        lines.push({
          id: 'prep',
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
          id: mod.id,
          label: mod.label,
          note: `${mod.pctAdjust > 0 ? '+' : ''}${Math.round(mod.pctAdjust * 100)}% of subtotal`,
          cents,
        });
      }

      if (REFERENCE_RULES.mobilizationFeeCents > 0) {
        lines.push({
          id: 'mobilization',
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
      // The rule cannot leave [REFERENCE_SQFT_MIN, REFERENCE_SQFT_MAX], so
      // this is unreachable by interaction. It is kept because the kernel is
      // allowed to reject a rules document, and a hero that throws is a blank
      // page above the fold.
      return {
        kind: 'error',
        message: 'That combination is not priced by this configuration.',
      };
    }
  }, [sqft, tierKey, modifierIds]);

  const priceNum = Number(price.replace(/[^0-9.]/g, ''));
  const priceCents =
    Number.isFinite(priceNum) && priceNum > 0 ? Math.round(priceNum * 100) : null;
  const inBand =
    outcome.kind === 'priced' && priceCents !== null
      ? priceCents >= outcome.lowCents && priceCents <= outcome.highCents
      : null;

  return (
    <div className="border border-rule bg-sheet">
      {/* ==================================================================
          INPUTS — the panel. Machine Black, because this is chrome, not
          information. Information is the Ticket White document below it.
          ================================================================== */}
      <div className="bg-ink px-4 py-4 text-sheet sm:px-5">
        {/* THE RULE. Same component the installed widget uses. */}
        <DatumRule
          min={REFERENCE_SQFT_MIN}
          max={REFERENCE_SQFT_MAX}
          value={sqft}
          step={10}
          onChange={onSqftChange}
          label="Square feet on that job"
          unitSuffix="sq ft"
        />

        <fieldset className="mt-5">
          <legend className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
            Finish you installed
          </legend>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {REFERENCE_FINISHES.map((f) => {
              const on = f.tierKey === tierKey;
              const photo = finishPhotoFor('epoxy', f.tierKey);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => chooseFinish(f.tierKey)}
                  aria-pressed={on}
                  className={`press rounded-milled border p-1.5 text-left ${
                    on ? 'border-hazard bg-hazard text-sheet' : 'border-rule bg-ink text-sheet'
                  }`}
                >
                  {photo && (
                    <FinishPhoto
                      photo={photo}
                      sizes="(min-width: 640px) 180px, 32vw"
                    />
                  )}
                  <span className="mt-1.5 block text-sm leading-tight">{f.label}</span>
                  <span className="mt-0.5 block font-data text-2xs tabular text-rule">
                    ${(BASE_RATES[f.tierKey] / 100).toFixed(2)}/sqft
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
            Condition of the slab
          </legend>
          <div className="mt-2 flex flex-col gap-1.5">
            {REFERENCE_RULES.conditionModifiers.map((m) => {
              const on = modifierIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleModifier(m.id)}
                  aria-pressed={on}
                  className={`press flex items-center justify-between rounded-milled border px-3 py-3 text-left text-sm ${
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

        <label className="mt-5 block" htmlFor="cal-price">
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

      {/* ==================================================================
          OUTPUT — Ticket White, because a figure is on it.
          ================================================================== */}
      <div className="bg-sheet px-4 py-4 sm:px-5">
        {outcome.kind === 'error' && <p className="text-sm">{outcome.message}</p>}

        {outcome.kind === 'priced' && (
          <>
            <p className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
              Quoted range
            </p>

            {/* THE BAND, drawn as a bracketed span rather than two numbers in
                a box. A quote IS a distance, and a contractor reading a
                bracket understands instantly that he is looking at a
                tolerance rather than a promise — which is also the legally
                safer reading. Same language as the installed widget's
                PriceSpan; see CountingFigure for why the figures are not that
                component. */}
            <div className="mt-2">
              <div aria-hidden className="relative h-3">
                <div className="absolute left-0 top-0 h-3 w-px bg-ink" />
                <div className="absolute right-0 top-0 h-3 w-px bg-ink" />
                <div className="absolute inset-x-0 top-0 h-px bg-ink" />
              </div>
              <div className="mt-1.5 flex items-start justify-between">
                <div>
                  <CountingFigure
                    cents={outcome.lowCents}
                    animate={animate}
                    className="block font-display text-2xl font-extrabold leading-none text-ink"
                  />
                  <span className="mt-1 block font-data text-2xs uppercase tracking-[0.08em] text-rule">
                    low
                  </span>
                </div>
                <div className="text-right">
                  <CountingFigure
                    cents={outcome.highCents}
                    animate={animate}
                    className="block font-display text-2xl font-extrabold leading-none text-ink"
                  />
                  <span className="mt-1 block font-data text-2xs uppercase tracking-[0.08em] text-rule">
                    high
                  </span>
                </div>
              </div>
            </div>

            {/* Screen readers get the figures as text. The counting loop
                writes textContent on elements they would otherwise re-announce
                on every frame, so the authoritative statement lives here and
                the figures above are left for the eye. */}
            <p className="sr-only" aria-live="polite">
              Estimated between {wholeDollars(outcome.lowCents)} and{' '}
              {wholeDollars(outcome.highCents)}.
            </p>

            {priceCents !== null && (
              <div className="mt-4 border-t border-rule pt-3">
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
              <table className="mt-4 w-full border-t border-rule text-sm">
                <caption className="sr-only">Itemised breakdown</caption>
                <tbody>
                  {outcome.lines.map((l) => {
                    const lit = flash.ids.includes(l.id);
                    /* The mark is rendered per CELL rather than per ROW.
                       position:relative on a <tr> is supported unevenly enough
                       across older mobile engines that it is not worth
                       spending a first push on, and two adjacent cell overlays
                       read as one continuous mark. */
                    const mark = lit ? (
                      <span
                        key={flash.nonce}
                        aria-hidden
                        className="flash-line pointer-events-none absolute inset-0 bg-hazard"
                      />
                    ) : null;
                    return (
                      <tr key={l.id} className="border-b border-rule">
                        <td className="relative py-2 pr-3 align-top">
                          {mark}
                          {l.label}
                          <span className="block font-data text-2xs uppercase tracking-[0.08em] text-rule">
                            {l.note}
                          </span>
                        </td>
                        <td className="relative py-2 text-right align-top font-data tabular">
                          {mark}
                          {wholeDollars(l.cents)}
                        </td>
                      </tr>
                    );
                  })}
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

            <p className="mt-3 text-sm text-rule">
              Drag the rule. Every line above recalculates as you move it — that is the engine, not
              a picture of one.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
