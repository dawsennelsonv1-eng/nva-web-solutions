'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  visibleGroups,
  missingRequired,
  comboKeyFor,
  swatchKeyFor,
  selectionSummary,
  type Selections,
  type FinishOptionDef,
  type CostTier,
} from '@/lib/verticals/epoxy/options';
import { getFinishMediaAction } from '@/app/actions/finishMedia';

/**
 * components/site/FinishPicker.tsx — WHERE A HOMEOWNER BUILDS HIS FLOOR.
 *
 * ============================================================================
 * THE BIG PICTURE IS ABOVE THE SWATCHES, AND THAT IS THE WHOLE DESIGN
 * ============================================================================
 *
 * Nobody can assemble "metallic pour, copper burl, polyaspartic clear" in
 * their head out of three small rectangles. They can understand one
 * photograph instantly. So the combination photo leads, at full width, and
 * every tap below updates it — the same shape as the tool cards on the
 * homepage, because that is the shape that already works here.
 *
 * When no photograph exists for that exact mix, the space does NOT get filled
 * with a near-miss from a different floor. It says so plainly and shows the
 * chosen materials instead. Showing somebody a picture of a floor that is not
 * the one they chose, labelled as the one they chose, is the fabrication this
 * codebase refuses everywhere else, and it would be found out on install day.
 *
 * ============================================================================
 * COST IS A RANK. IT IS NEVER MONEY, ANYWHERE ON THIS SCREEN.
 * ============================================================================
 *
 * Four bars against a group's dearest option. It answers "is this the
 * expensive one?" and nothing else, and it is drawn per GROUP because a tier-5
 * add-on and a tier-5 coating are not comparable amounts.
 *
 * It exists so people self-select. Without it they pick the most beautiful
 * option in every group, meet the price, and leave — and the contractor gets a
 * dead lead with a bad taste attached. With it, the same person lands
 * somewhere they will actually buy.
 *
 * NO PRICE APPEARS HERE. Not a range, not a "from", not a per-square-foot
 * figure. The number arrives once, with the render, at the end.
 *
 * ============================================================================
 * SWATCHES ARE RECTANGLES, NOT CIRCLES
 * ============================================================================
 *
 * A circle is right for a paint colour, where the whole answer is a hue. These
 * are materials with pattern, flake size and depth, and a rectangle shows
 * enough of that to choose from. Bigger than a dot for the same reason.
 */

export interface FinishPickerProps {
  verticalId: string;
  selections: Selections;
  onChange: (next: Selections) => void;
  /** Rendered under the groups — the caller owns the call to action. */
  children?: React.ReactNode;
}

interface Pic {
  kind: string;
  mediaKey: string;
  src: string;
  alt: string;
  caption: string;
}

function CostRank({ tier }: { tier: CostTier }) {
  return (
    <span className="fp-cost" aria-label={'Relative cost ' + tier + ' of 5'}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= tier ? 'fp-cost-on' : 'fp-cost-off'} aria-hidden />
      ))}
    </span>
  );
}

export function FinishPicker({ verticalId, selections, onChange, children }: FinishPickerProps) {
  const [pics, setPics] = useState<Pic[] | null>(null);

  /**
   * Fetched once, on mount. The picker only mounts after a floor has been
   * measured, so this is not a query on every homepage view.
   *
   * A failure leaves `pics` as an empty list, not null, so the UI stops
   * showing a loading state and settles into flat-colour swatches. Spinning
   * forever because a table is missing would be worse than the honest
   * fallback.
   */
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const rows = await getFinishMediaAction(verticalId);
        if (live) setPics(rows);
      } catch {
        if (live) setPics([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [verticalId]);

  const byKey = useMemo(() => {
    const m = new Map<string, Pic>();
    for (const p of pics ?? []) m.set(p.kind + '|' + p.mediaKey, p);
    return m;
  }, [pics]);

  const groups = visibleGroups(selections);
  const missing = missingRequired(selections);
  const comboKey = comboKeyFor(selections);
  const hero = byKey.get('combination|' + comboKey);
  const summary = selectionSummary(selections);

  const pick = (groupKey: string, optionKey: string, multiple: boolean) => {
    const current = selections[groupKey];
    if (!multiple) {
      // Tapping the chosen option again clears it. A required group's
      // "missing" state then returns, which is honest — the person genuinely
      // has not decided.
      onChange({ ...selections, [groupKey]: current === optionKey ? undefined : optionKey });
      return;
    }
    const list = Array.isArray(current) ? current : [];
    const next = list.includes(optionKey)
      ? list.filter((k) => k !== optionKey)
      : [...list, optionKey];
    onChange({ ...selections, [groupKey]: next });
  };

  const isOn = (groupKey: string, optionKey: string) => {
    const v = selections[groupKey];
    if (Array.isArray(v)) return v.includes(optionKey);
    return v === optionKey;
  };

  const swatchFor = (groupKey: string, o: FinishOptionDef) =>
    byKey.get('swatch|' + swatchKeyFor(groupKey, o.key));

  return (
    <div className="fp">
      {/* ---- the hero ---- */}
      <div className="fp-hero">
        {hero ? (
          <>
            {/* A plain img: these are Supabase public URLs and the card is a
                client component with no access to next/image's loader config
                for that host. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hero.src} alt={hero.alt} className="fp-hero-img" />
            {hero.caption && <p className="fp-hero-cap">{hero.caption}</p>}
          </>
        ) : (
          <div className="fp-hero-none">
            <p className="fp-hero-none-h">
              {summary.length > 0 ? 'Your mix' : 'Start with the coating'}
            </p>
            {summary.length > 0 ? (
              <>
                <ul className="fp-mix">
                  {summary.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="fp-hero-none-b">
                  No reference photo of this exact combination yet. You will see it on
                  your own floor at the end — that one is made from your photos.
                </p>
              </>
            ) : (
              <p className="fp-hero-none-b">
                Pick a coating below and this fills in.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ---- the groups ---- */}
      {groups.map((g) => (
        <fieldset key={g.key} className="fp-group">
          <legend className="fp-group-h">
            {g.label}
            {g.required && missing.some((m) => m.key === g.key) && (
              <span className="fp-need"> · choose one</span>
            )}
          </legend>
          <p className="fp-group-b">{g.blurb}</p>

          <div className="fp-swatches">
            {g.options.map((o) => {
              const pic = swatchFor(g.key, o);
              const on = isOn(g.key, o.key);
              return (
                <button
                  key={o.key}
                  type="button"
                  className={'fp-sw' + (on ? ' fp-sw-on' : '')}
                  aria-pressed={on}
                  onClick={() => pick(g.key, o.key, g.multiple)}
                >
                  <span className="fp-sw-img">
                    {pic ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pic.src} alt="" loading="lazy" />
                    ) : (
                      <span
                        aria-hidden
                        className="fp-sw-flat"
                        style={o.hex ? { backgroundColor: o.hex } : undefined}
                      />
                    )}
                  </span>
                  <span className="fp-sw-label">{o.label}</span>
                  <span className="fp-sw-blurb">{o.blurb}</span>
                  <CostRank tier={o.costTier} />
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {children}
    </div>
  );
}
