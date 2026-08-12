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
import { getFinishMediaAction, isOperatorAction } from '@/app/actions/finishMedia';
import { CombinationUploader } from '@/components/site/CombinationUploader';

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
   * ==========================================================================
   * THE LAST OPTION TOUCHED, AND WHY IT IS ONE LINE INSTEAD OF FIFTY-TWO.
   * ==========================================================================
   *
   * Every swatch used to carry its own `blurb` paragraph. With 52 options
   * across 10 groups that is 52 paragraphs stacked vertically, and the picker
   * became a document somebody had to scroll through rather than a set of
   * choices somebody could see. Six of the seven colours in one group are
   * described in three lines each, and a person choosing a colour is looking
   * at colour — the words are what he reads AFTER something catches his eye,
   * not before.
   *
   * So the descriptions collapse into a single strip, pinned at the top with
   * the preview, showing the one option he most recently tapped. The same
   * words, the same cost rank, one at a time, in a place he is already
   * looking. The grid underneath becomes swatches and labels, which is what a
   * swatch grid should be.
   *
   * Stored as keys rather than as the option object so a catalogue edit cannot
   * leave a stale description pinned to the top of the screen.
   */
  const [lastPick, setLastPick] = useState<{ group: string; option: string } | null>(null);
  /**
   * Whether the operator is the one looking at this.
   *
   * Starts false and only ever becomes true, so a visitor never sees the
   * upload control flash in before it is hidden again. The server checks this
   * for real on every write — see app/actions/finishMedia.ts.
   */
  const [isOperator, setIsOperator] = useState(false);
  /** Bumped to refetch after the operator attaches or removes a photograph. */
  const [reload, setReload] = useState(0);

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
  }, [verticalId, reload]);

  /**
   * Asked once, separately from the pictures.
   *
   * Separate because it must not be able to fail the pictures: a visitor whose
   * session lookup errors should still get a working picker, and the two have
   * nothing to do with each other beyond both being needed at mount.
   */
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const yes = await isOperatorAction();
        if (live && yes) setIsOperator(true);
      } catch {
        // Stays false. The control is hidden, which is the safe direction.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

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
      const clearing = current === optionKey;
      // Tapping the chosen option again clears it. A required group's
      // "missing" state then returns, which is honest — the person genuinely
      // has not decided.
      onChange({ ...selections, [groupKey]: clearing ? undefined : optionKey });
      // The strip describes what he just touched, so an option he just
      // REMOVED must not stay described at the top of the screen as though it
      // were still his answer.
      setLastPick(clearing ? null : { group: groupKey, option: optionKey });
      return;
    }
    const list = Array.isArray(current) ? current : [];
    const removing = list.includes(optionKey);
    const next = removing ? list.filter((k) => k !== optionKey) : [...list, optionKey];
    onChange({ ...selections, [groupKey]: next });
    setLastPick(removing ? null : { group: groupKey, option: optionKey });
  };

  const isOn = (groupKey: string, optionKey: string) => {
    const v = selections[groupKey];
    if (Array.isArray(v)) return v.includes(optionKey);
    return v === optionKey;
  };

  const swatchFor = (groupKey: string, o: FinishOptionDef) =>
    byKey.get('swatch|' + swatchKeyFor(groupKey, o.key));

  /**
   * The option the strip is currently describing.
   *
   * Resolved against `groups`, which is `visibleGroups(selections)` — so an
   * option whose group has since been hidden by progressive reveal (a flake
   * blend after switching to metallic) resolves to nothing and the strip
   * empties. Describing a choice that is no longer on offer would be worse
   * than describing nothing.
   */
  const described = lastPick
    ? (groups
        .find((g) => g.key === lastPick.group)
        ?.options.find((o) => o.key === lastPick.option) ?? null)
    : null;

  return (
    <div className="fp">
      {/* ------------------------------------------------------------------
          THE STICKY BLOCK — PREVIEW PLUS THE ONE-LINE DESCRIPTION.

          The preview used to scroll away with everything else, so choosing a
          flake blend meant scrolling to the top to see what the last one
          looked like, scrolling back down, tapping, and scrolling up again.
          The picture is the whole reason the options mean anything; it has to
          be on screen while they are being chosen.

          `position: sticky` in phase30.css, capped so it can never take more
          than about a third of a phone screen. NOT IntersectionObserver:
          `no-restricted-syntax` bans it on components/site/** and it would be
          the wrong tool anyway — this is a layout behaviour, and the browser
          does it for free.
         ------------------------------------------------------------------ */}
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

        {/* ----------------------------------------------------------------
            ONE DESCRIPTION, FOR THE OPTION JUST TAPPED.

            Inside the sticky block on purpose: it is pinned with the picture,
            so a person tapping through a colour group reads the note without
            his eye leaving the preview.

            THE SPACE IS RESERVED WHETHER OR NOT ANYTHING IS DESCRIBED. An
            empty strip that collapses would push the entire grid up and down
            by a line on every single tap — the exact class of movement phase 3
            was spent eliminating. It holds its height and shows a prompt
            instead.
           ---------------------------------------------------------------- */}
        <div className="fp-note" aria-live="polite">
          {described ? (
            <>
              <span className="fp-note-label">{described.label}</span>
              <span className="fp-note-blurb">{described.blurb}</span>
              <CostRank tier={described.costTier} />
            </>
          ) : (
            <span className="fp-note-idle">Tap any option to read about it.</span>
          )}
        </div>
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
                  title={o.blurb}
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
                  {/* THE BLURB IS GONE FROM HERE. It lives in the pinned strip
                      above, one at a time. Fifty-two paragraphs stacked down
                      the page is what made this screen a scroll instead of a
                      choice. `title` keeps the text reachable on a pointer
                      device without occupying any layout. */}
                  <CostRank tier={o.costTier} />
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {/* Last, under everything. The operator assembles a mix the same way a
          visitor does, then attaches the photograph he took of that exact
          floor — so the key is computed rather than typed and cannot be
          wrong. */}
      {isOperator && (
        <CombinationUploader
          vertical={verticalId}
          comboKey={comboKey}
          summary={summary}
          hasPhoto={Boolean(hero)}
          onSaved={() => setReload((n) => n + 1)}
        />
      )}

      {children}
    </div>
  );
}
