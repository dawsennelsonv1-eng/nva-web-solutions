'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  visibleGroups,
  missingRequired,
  comboKeyFor,
  swatchKeyFor,
  selectionSummary,
  withDefaults,
  isAutoFilledGroup,
  type Selections,
  type FinishOptionDef,
  type FinishGroupDef,
  type CostTier,
} from '@/lib/verticals/epoxy/options';
import { getFinishMediaAction, isOperatorAction } from '@/app/actions/finishMedia';
import { CombinationUploader } from '@/components/site/CombinationUploader';
import { ExpandButton, ImageViewer, type ViewerItem } from '@/components/tools/ImageViewer';
import { downloadImage } from '@/lib/media/download';

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

/**
 * A stable string for one set of choices, used only to compare two of them.
 *
 * NOT `comboKeyFor`. That deliberately excludes groups which change nothing
 * visible, so two genuinely different selections can share a combination key —
 * and comparing on it would make the defaults effect believe an answer had
 * been applied when it had not. This has to see every group.
 */
function signatureOf(selections: Selections): string {
  return Object.keys(selections)
    .filter((k) => {
      const v = selections[k];
      return Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.length > 0;
    })
    .sort()
    .map((k) => {
      const v = selections[k];
      return k + '=' + (Array.isArray(v) ? [...v].sort().join('+') : String(v));
    })
    .join('&');
}

const VIDEO_SRC_RE = /^[^?]+\.(mp4|webm|mov)(\?|$)/i;
function isVideoSrc(src: string): boolean {
  return VIDEO_SRC_RE.test(src);
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

  /** The picture currently open full screen, if any. */
  const [viewing, setViewing] = useState<ViewerItem | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  /**
   * ==========================================================================
   * NOTHING IS EVER UNANSWERED. PHASE 35.
   * ==========================================================================
   *
   * On arrival the picker filled in nothing, so the first thing a visitor met
   * was an empty state telling him to start — and, far worse, the combination
   * key it computed from those blanks could not match anything the admin
   * combination studio had ever generated. `withDefaults` in
   * lib/verticals/epoxy/options.ts sets out that mismatch in full; the short
   * version is that an unanswered `topcoat` guaranteed a miss on every single
   * combination.
   *
   * THE PARENT STILL OWNS THE STATE. This component is controlled — ToolCard
   * holds `selections` — so the fill cannot be done locally without the two
   * copies disagreeing about what the visitor chose. It asks, through the same
   * `onChange` a tap goes through, which also means the lead carries the
   * defaults exactly as it carries a deliberate choice.
   *
   * TWO GUARDS AGAINST AN ENDLESS LOOP, and both are needed:
   *
   *   1. If the filled version equals what we already have, do nothing. This
   *      is what stops the effect after the parent accepts the change.
   *
   *   2. If we have ALREADY asked for this exact set and it did not take, do
   *      not ask again. A parent that ignores or filters `onChange` would
   *      otherwise be asked on every render for ever, and `onChange` is an
   *      inline arrow at the call site, so it changes identity every render
   *      and cannot be relied on to settle by itself.
   */
  const defaulted = useMemo(() => withDefaults(selections), [selections]);
  const asked = useRef<string | null>(null);

  useEffect(() => {
    const wanted = signatureOf(defaulted);
    if (wanted === signatureOf(selections)) return;
    if (asked.current === wanted) return;
    asked.current = wanted;
    onChange(defaulted);
  }, [defaulted, selections, onChange]);

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

  const pick = (group: FinishGroupDef, optionKey: string) => {
    const groupKey = group.key;
    const multiple = group.multiple;
    const current = selections[groupKey];
    if (!multiple) {
      const clearing = current === optionKey;

      /**
       * PHASE 35: A MANDATORY GROUP CANNOT BE CLEARED BY TAPPING TWICE.
       *
       * It used to be. The comment that stood here argued that returning to
       * the "missing" state was honest, and against a picker that started
       * blank it was. It is not compatible with one that fills itself in:
       * `withDefaults` would put the same answer straight back, and what the
       * person would see is a swatch that flashes off and on and appears not
       * to work. Between an honest empty state nobody can reach and a control
       * that visibly misbehaves, the control wins.
       *
       * Still describes the option, because tapping it is a reasonable way to
       * ask "what is this one again?" and the strip is the answer.
       */
      if (clearing && isAutoFilledGroup(group)) {
        setLastPick({ group: groupKey, option: optionKey });
        return;
      }

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
   * Open the pinned picture full screen.
   *
   * `downloadName` is the COMBINATION KEY, not the alt text. When an operator
   * saves twenty of these to check them against each other, the file name is
   * the only thing left that says which mix each one is — and the key is the
   * exact string the picker looks a photograph up by, so a file named after it
   * can always be traced back to the row it came from.
   */
  const openHero = useCallback(() => {
    if (!hero) return;
    setViewing({
      src: hero.src,
      alt: hero.alt,
      caption: hero.caption,
      downloadName: comboKey,
    });
  }, [hero, comboKey]);

  const saveHero = useCallback(async () => {
    if (!hero) return;
    setSaveNote(null);
    try {
      const outcome = await downloadImage(hero.src, comboKey);
      setSaveNote(
        outcome === 'downloaded'
          ? 'Saved to your downloads.'
          : 'Opened in a new tab — long-press there to save it.'
      );
    } catch {
      setSaveNote('It could not be saved. Long-press the picture instead.');
    }
  }, [hero, comboKey]);

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
          THE PINNED PREVIEW. NOTHING ELSE IS IN HERE ANY MORE.

          The preview used to scroll away with everything else, so choosing a
          flake blend meant scrolling to the top to see what the last one
          looked like, scrolling back down, tapping, and scrolling up again.
          The picture is the whole reason the options mean anything; it has to
          be on screen while they are being chosen.

          PHASE 35 changed two things about it. The description strip moved out
          from underneath — it is now below this block — and the picture took
          the space that freed, going from 32vh to 42vh. It is `.fp-stage*`
          rather than `.fp-hero*` because phase30.css owns the old names and a
          later layer may not redefine what an earlier one declared; phase35.css
          sets out that constraint in full.

          `position: sticky` in phase35.css. NOT IntersectionObserver:
          `no-restricted-syntax` bans it on components/site/** and it would be
          the wrong tool anyway — this is a layout behaviour, and the browser
          does it for free.
         ------------------------------------------------------------------ */}
      <div className="fp-stage">
        {hero ? (
          <div className="fp-stage-media">
            {/* ----------------------------------------------------------------
                VIDEO AS WELL AS STILLS.

                A flake blend is a texture and a metallic pour is movement in
                resin. A still photograph of either is the weakest possible
                version of the argument, and this bar stays on screen through
                the entire scroll — whatever sits in it is what the visitor
                looks at while he decides.

                An ANIMATED GIF needs nothing here: the browser plays it inside
                an <img>. Only a real video file needs its own element, so the
                branch is on the extension rather than on `kind`, which
                describes the slot's role rather than the file's format.

                autoPlay + muted + loop + playsInline is the exact set required
                for a video to play inline and unattended on iOS. Drop `muted`
                and Safari refuses to autoplay; drop `playsInline` and it takes
                over the whole screen, which on a phone means the picker
                vanishes underneath it.

                No controls: pinned, this is a swatch, not a video the visitor
                is meant to operate. It gets controls in the full-screen
                viewer, where operating it is the point.
               ---------------------------------------------------------------- */}
            {isVideoSrc(hero.src) ? (
              <video
                className="fp-stage-img"
                src={hero.src}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={hero.alt}
              />
            ) : (
              /* A plain img: these are Supabase public URLs and this is a
                 client component with no access to next/image's loader config
                 for that host. */
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={hero.src}
                alt={hero.alt}
                className="fp-stage-img"
                onClick={() => openHero()}
              />
            )}

            {/* Two controls, both over the picture rather than under it —
                under it is the space this phase was spent reclaiming. */}
            <div className="fp-stage-tools">
              <ExpandButton onClick={() => openHero()} label="See this floor full size" />
              <button
                type="button"
                className="lb-open"
                aria-label="Download this picture"
                onClick={() => void saveHero()}
              >
                <span aria-hidden>&darr;</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="fp-stage-none">
            <p className="fp-stage-none-h">
              {summary.length > 0 ? 'Your mix' : 'Start with the coating'}
            </p>
            {summary.length > 0 ? (
              <>
                <ul className="fp-mix">
                  {summary.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="fp-stage-none-b">
                  No reference photo of this exact combination yet. You will see it on
                  your own floor at the end &mdash; that one is made from your photos.
                </p>
              </>
            ) : (
              <p className="fp-stage-none-b">Pick a coating below and this fills in.</p>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------
          THE DESCRIPTION STRIP, NOW BELOW THE PINNED PICTURE.

          It used to live INSIDE the sticky block, directly under the frame.
          That is the most expensive real estate on this screen and it was
          being spent on the least important element: `.fp-note` is a fixed
          2.75rem, and with its margin it was taking roughly a fifth of the
          pinned budget away from the photograph the whole feature exists to
          show. Moving it out is what pays for the bigger picture.

          THE TRADE, STATED PLAINLY: it now scrolls away with the page, so
          somebody tapping a swatch far down a long group no longer has the
          description on screen. That is a real loss and it is the smaller
          one. The picture answers "what does this look like", which is the
          question people are actually asking of a floor; the blurb answers
          "what is it called", and it remains on every swatch's `title` and in
          the strip the moment they scroll back up.
         ------------------------------------------------------------------ */}
      <div className="fp-note fp-note-lower" aria-live="polite">
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

      {saveNote ? (
        <p className="fp-save-note" role="status">
          {saveNote}
        </p>
      ) : null}

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
                  onClick={() => pick(g, o.key)}
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

      <ImageViewer item={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

