'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DatumRule } from '@/components/widget/DatumRule';
import { CountingFigure } from '@/components/site/CountingFigure';
import { FinishPhoto } from '@/components/site/FinishPhoto';
import { calculateQuote, type PricingRules } from '@/lib/quote/pricing';
import { finishPhotoFor } from '@/lib/site/finish-photos';

/**
 * components/site/MiniPricer.tsx — THE LIVE MINI-DEMO INSIDE A SHOWCASE CARD.
 *
 * ============================================================================
 * "TRY ME OUT" CONSUMES ZERO QUOTA — BY CONSTRUCTION, NOT BY A FLAG
 * ============================================================================
 *
 * There was no preview mode in this codebase. /demo runs `mode: 'live'`: real
 * AI photo analysis, a real ai_jobs row, real spend, a real lead write. A
 * showcase card wired to that would bill for every idle tap from a paid feed.
 *
 * This does not have a quota to consume, because it has no path that could
 * consume one. There is no photo step, no vision call, no server action, no
 * lead write, and no network request of any kind. It calls lib/quote/pricing
 * directly in the browser — the same module the installed widget calls, which
 * is deliberately isomorphic for exactly this reason (see its header).
 *
 * That is a stronger guarantee than a `preview: true` flag threaded through
 * the widget machine, because a flag can be dropped by a future refactor and
 * an absent code path cannot. The cost of it is that this is not the full
 * four-step widget — it cannot be, because the AI step is the thing being
 * removed. It is the ARITHMETIC, live and honest, which is the part a
 * contractor is actually evaluating.
 *
 * ============================================================================
 * GENERIC OVER THE VERTICAL, ON PURPOSE
 * ============================================================================
 *
 * `rules` and `finishes` are props rather than imports. Adding the second live
 * card the day a painting rules document exists is one call site here, not a
 * second component. The Phase 11 vertical contract says a module owns its own
 * price() and steps[]; this respects the same shape from the marketing side.
 *
 * WHAT IT DELIBERATELY DOES NOT SHOW: the itemised breakdown. That lives in
 * the hero, one screen up, where there is room to read it. Repeating it here
 * would make the card a second hero rather than a demonstration that the same
 * engine drives every trade.
 */

export interface MiniPricerFinish {
  id: string;
  label: string;
  tierKey: string;
}

export interface MiniPricerProps {
  /** Used to look up finish photography. Matches the vertical module's id. */
  verticalId: string;
  rules: PricingRules;
  finishes: MiniPricerFinish[];
  sqftMin: number;
  sqftMax: number;
  defaultSqft: number;
  defaultTier: string;
  /** Registry surface id. Recorded by the kernel, not priced. */
  surfaceTypeId: string;
  unitLabel?: string;
}

export function MiniPricer({
  verticalId,
  rules,
  finishes,
  sqftMin,
  sqftMax,
  defaultSqft,
  defaultTier,
  surfaceTypeId,
  unitLabel = 'sq ft',
}: MiniPricerProps) {
  const [sqft, setSqft] = useState(defaultSqft);
  const [tierKey, setTierKey] = useState(defaultTier);
  const [animate, setAnimate] = useState(true);

  // Same one-commit-per-frame coalescing as the hero. A range input fires many
  // times per frame; the pricing kernel parses its rules document on every
  // call, and running that several times between two paints buys nothing a
  // screen can show.
  const pending = useRef(defaultSqft);
  const rafId = useRef(0);

  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  const onSqftChange = useCallback((v: number) => {
    pending.current = v;
    if (rafId.current) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0;
      setAnimate(false);
      setSqft(pending.current);
    });
  }, []);

  const band = useMemo(() => {
    try {
      const c = calculateQuote(
        {
          sqft,
          surfaceTypeId,
          finishTierKey: tierKey,
          conditionModifierIds: [],
          sqftMin,
          sqftMax,
        },
        rules
      );
      return { lowCents: c.lowCents, highCents: c.highCents };
    } catch {
      // A rules document this component was handed can be rejected by the
      // kernel. The card must still render — a broken price is a dead card,
      // and a dead card on the homepage is worse than a card that only links.
      return null;
    }
  }, [sqft, tierKey, surfaceTypeId, sqftMin, sqftMax, rules]);

  return (
    <div className="border border-rule bg-ink px-3 py-3 text-sheet">
      <DatumRule
        min={sqftMin}
        max={sqftMax}
        value={sqft}
        step={10}
        onChange={onSqftChange}
        label="Area"
        unitSuffix={unitLabel}
      />

      <div className="mt-4 grid grid-cols-3 gap-1.5">
        {finishes.map((f) => {
          const on = f.tierKey === tierKey;
          const photo = finishPhotoFor(verticalId, f.tierKey);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                if (f.tierKey === tierKey) return;
                setAnimate(true);
                setTierKey(f.tierKey);
              }}
              aria-pressed={on}
              className={`press rounded-milled border p-1 text-left ${
                on ? 'border-hazard bg-hazard text-sheet' : 'border-rule bg-ink text-sheet'
              }`}
            >
              {photo && <FinishPhoto photo={photo} sizes="(min-width: 640px) 140px, 28vw" />}
              <span className="mt-1 block text-2xs leading-tight">{f.label}</span>
            </button>
          );
        })}
      </div>

      {band && (
        <div className="mt-4 border-t border-rule pt-3">
          <p className="font-data text-2xs uppercase tracking-[0.08em] text-rule">Quoted range</p>
          <div className="mt-1 flex items-baseline justify-between">
            <CountingFigure
              cents={band.lowCents}
              animate={animate}
              className="font-display text-xl font-extrabold leading-none text-sheet"
            />
            <span aria-hidden className="mx-2 h-px flex-1 bg-rule" />
            <CountingFigure
              cents={band.highCents}
              animate={animate}
              className="font-display text-xl font-extrabold leading-none text-sheet"
            />
          </div>
          <p className="mt-2 font-data text-2xs uppercase tracking-[0.08em] text-rule">
            No account, no photo, nothing recorded
          </p>
        </div>
      )}
    </div>
  );
}
