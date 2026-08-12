'use client';

import { useMemo, useState } from 'react';
import styles from './AreaPanel.module.css';
import {
  AREA_UNITS,
  LENGTH_UNITS,
  areaFromDimensions,
  areaFromTotal,
  describeDimensions,
  formatSqft,
  verdictFor,
  type AreaUnitId,
  type LengthUnitId,
} from '@/lib/quote/units';

/**
 * components/site/AreaPanel.tsx — how big the floor is, and who says so.
 *
 * ============================================================================
 * THIS REPLACED A SLIDER, AND THE SLIDER WAS THE PROBLEM
 * ============================================================================
 *
 * What was here: the sentence "Roughly how big is the floor? An estimate is
 * fine.", a draggable rule, and a default of 480 sq ft sitting in it before
 * anyone had measured anything.
 *
 * Three things were wrong with that, and they compounded into the worst
 * failure this product has produced.
 *
 *   1. IT ASKED A QUESTION NOBODY CAN ANSWER. The entire pitch of this tool is
 *      "you do not need to measure anything". Opening with a control that only
 *      works if you already know your square footage contradicts the promise
 *      in the first interaction.
 *
 *   2. "ROUGHLY" AND "AN ESTIMATE IS FINE" GAVE THE NUMBER AWAY. A quote is
 *      only as good as its quantity. Copy that shrugs at the quantity tells
 *      the visitor the price is a guess, which is precisely the impression a
 *      contractor is paying to avoid.
 *
 *   3. THE DEFAULT WAS INDISTINGUISHABLE FROM AN ANSWER. 480 sat in the rule
 *      whether or not anything had been measured. When the vision chain failed
 *      — which it did, for weeks — the card priced a 200 sq ft courtyard as a
 *      480 sq ft garage and showed $3,069-$4,152 for it. More than double. A
 *      contractor who published that number could not have honoured it.
 *
 * ============================================================================
 * WHAT REPLACES IT
 * ============================================================================
 *
 * A STATEMENT, NOT A QUESTION. "Your floor is 187 sq ft", or the band the
 * model actually defended. Followed by what it was measured against, because
 * an authority that shows its working is the only kind worth having.
 *
 * A BAR THAT CANNOT BE DRAGGED. It shows where this floor sits between the
 * smallest and largest job this installer prices, and it shows the measured
 * band as a span. It has no knob, because it is a readout and not a control.
 *
 * ONE QUIET WAY TO DISAGREE. A small line of text — not a button — that opens
 * typed entry. See the .correct rule in the stylesheet for why it is
 * deliberately hard to notice.
 *
 * TYPED ENTRY THAT TAKES REAL MEASUREMENTS. Length x width in feet, inches,
 * metres, centimetres or yards, or a total in square feet, square metres or
 * square yards. A person standing in his garage with a tape measure has two
 * numbers and no calculator; asking him for an area in square feet is asking
 * him to do arithmetic he did not sign up for.
 *
 * ============================================================================
 * THE INVARIANT THIS COMPONENT EXISTS TO ENFORCE
 * ============================================================================
 *
 * A SQUARE FOOTAGE IS EITHER MEASURED OR TYPED. THERE IS NO THIRD SOURCE.
 *
 * `source` is null until one of those two things has happened, and the card
 * will not price or unlock while it is null. There is no default any more —
 * not 480, not the midpoint of the range, not anything. If this component
 * cannot say where a number came from, the card does not have one.
 */

export type AreaSource = 'measured' | 'manual';

export interface MeasuredBand {
  lowSqft: number;
  highSqft: number;
  reference: string | null;
  /** The model's own dimensions, in feet. Prefill the correction form. */
  lengthFt: number | null;
  widthFt: number | null;
}

export interface AreaPanelProps {
  /** Null until the floor has been measured or typed. */
  sqft: number | null;
  source: AreaSource | null;
  /** The band the model defended, when it produced one. */
  band: MeasuredBand | null;
  /** How many frames the measurement read, for the provenance line. */
  photoCount: number;
  min: number;
  max: number;
  /** Accepts square feet only. Conversion has already happened. */
  onConfirm: (sqft: number, source: AreaSource) => void;
  /**
   * Opens typed entry on mount. Set when the measurement failed or the model
   * was not sure — situations where the visitor has to answer and should not
   * have to find the quiet link first.
   */
  openByDefault?: boolean;
}

type Mode = 'dimensions' | 'total';

export function AreaPanel({
  sqft,
  source,
  band,
  photoCount,
  min,
  max,
  onConfirm,
  openByDefault = false,
}: AreaPanelProps) {
  const [open, setOpen] = useState(openByDefault);
  const [mode, setMode] = useState<Mode>('dimensions');
  /**
   * ==========================================================================
   * PREFILLED WITH THE MODEL'S OWN READING.
   * ==========================================================================
   *
   * A person who opens this form is disagreeing with the measurement — and
   * almost always about ONE of the two numbers. He can see the garage door is
   * wider than eleven feet; he has no quarrel with the eighteen.
   *
   * Starting him from two empty boxes makes him re-measure the whole floor to
   * correct half of it. Starting him from "11 x 18" makes it one keystroke.
   * That difference decides whether the correction happens at all, and a
   * correction that does not happen is a wrong quote that goes out anyway.
   *
   * `useState` initialisers, so they seed once and never fight the person as
   * he types. If the measurement changes underneath him — a re-analysis — the
   * form he is actively editing is HIS, and clobbering it mid-keystroke would
   * be the worse behaviour by far.
   */
  const [length, setLength] = useState(() =>
    band?.lengthFt != null ? String(band.lengthFt) : ''
  );
  const [width, setWidth] = useState(() => (band?.widthFt != null ? String(band.widthFt) : ''));
  const [total, setTotal] = useState('');
  const [lengthUnit, setLengthUnit] = useState<LengthUnitId>('ft');
  const [areaUnit, setAreaUnit] = useState<AreaUnitId>('sqft');
  /**
   * Nothing is rendered as an error until the visitor asks for the number to
   * be used. Validating on every keystroke means "104 is below the minimum"
   * flashes up while somebody is on their way to typing 1,040 — scolding a
   * person for a number they have not finished writing.
   */
  const [touched, setTouched] = useState(false);

  const raw = useMemo(
    () =>
      mode === 'dimensions'
        ? areaFromDimensions(length, width, lengthUnit)
        : areaFromTotal(total, areaUnit),
    [mode, length, width, lengthUnit, total, areaUnit]
  );

  const verdict = useMemo(() => verdictFor(raw, min, max), [raw, min, max]);
  const echo = useMemo(
    () => (mode === 'dimensions' ? describeDimensions(length, width, lengthUnit) : null),
    [mode, length, width, lengthUnit]
  );

  /**
   * Where the fill sits on the rail. Not the raw value over the range: the
   * smallest job is 100 sq ft against a 6,000 sq ft ceiling, so a linear
   * placement puts every domestic garage in the leftmost eighth of the bar and
   * the readout looks broken. The bar is there to say "this is a normal job
   * for this installer", and on a linear scale it says the opposite.
   *
   * A LOG SCALE IS THE HONEST ONE HERE because the range spans two orders of
   * magnitude and the perceptual difference between 200 and 400 sq ft is the
   * same as between 2,000 and 4,000 — both are "twice the job".
   */
  const place = useMemo(() => {
    const lo = Math.log(Math.max(1, min));
    const hi = Math.log(Math.max(2, max));
    return (v: number) => {
      const c = Math.log(Math.min(max, Math.max(min, v)));
      return hi <= lo ? 0 : (c - lo) / (hi - lo);
    };
  }, [min, max]);

  const confirm = () => {
    setTouched(true);
    if (!verdict.ok) return;
    onConfirm(verdict.sqft, 'manual');
    setOpen(false);
  };

  const known = sqft !== null && source !== null;

  return (
    <div>
      {known ? (
        <>
          {/* ------------------------------------------------------------
              THE STATEMENT.

              A BAND WHERE THERE IS ONE. "Between 150 and 240 sq ft" is what
              the model actually concluded, and it reads as MORE authoritative
              than a bare midpoint, not less — a range is the shape of
              something that was measured. A flat "195 sq ft" is a guess in the
              costume of a measurement, and when the slab turns out to be 240
              the contractor eats the difference in front of his customer.
             ------------------------------------------------------------ */}
          {source === 'measured' && band ? (
            <p className={styles.stated}>
              Your floor is between{' '}
              <span className={styles.figure}>{formatSqft(band.lowSqft)}</span> and{' '}
              <span className={styles.figure}>{formatSqft(band.highSqft)}</span> sq ft.
            </p>
          ) : (
            <p className={styles.stated}>
              Your floor is <span className={styles.figure}>{formatSqft(sqft)}</span> sq ft.
            </p>
          )}

          <p className={styles.source}>
            {source === 'measured'
              ? `Read from your ${photoCount} photo${photoCount === 1 ? '' : 's'}` +
                /* THE DIMENSIONS, WHERE THE MODEL GAVE THEM.
                   "about 11 ft by 18 ft, measured against the garage door" is
                   a claim a person standing in his garage can check in five
                   seconds. "187 sq ft" is one he can only accept or reject.
                   Showing the working is what makes the number authoritative
                   rather than merely confident. */
                (band?.lengthFt != null && band?.widthFt != null
                  ? ` — about ${band.lengthFt} ft by ${band.widthFt} ft`
                  : '') +
                (band?.reference ? `, measured against the ${band.reference}` : '') +
                '. Pricing uses ' +
                formatSqft(sqft) +
                ' sq ft.'
              : 'The size you entered. Everything below is priced against it.'}
          </p>

          {/* The readout. No knob — see the stylesheet. */}
          <div className={styles.bar}>
            <div
              className={styles.rail}
              style={
                {
                  '--ap-p': place(sqft).toFixed(4),
                  ...(band
                    ? {
                        '--ap-lo': place(band.lowSqft).toFixed(4),
                        '--ap-hi': place(band.highSqft).toFixed(4),
                      }
                    : {}),
                } as React.CSSProperties
              }
            >
              {band ? <span aria-hidden className={styles.span} /> : null}
              <span aria-hidden className={styles.fill} />
            </div>
            <div aria-hidden className={styles.ends}>
              <span>{formatSqft(min)}</span>
              <span>{formatSqft(max)}</span>
            </div>
          </div>

          {!open && (
            <button type="button" className={styles.correct} onClick={() => setOpen(true)}>
              {/* HUMAN, NOT A FORM LABEL.
                  "Not the size of my floor — enter it myself" is a
                  specification read aloud. Nobody standing in his garage
                  thinks that sentence. He thinks "that's not right". */}
              {source === 'measured' ? "That's not right — I'll type it in" : 'Change the size'}
            </button>
          )}
        </>
      ) : (
        !open && (
          /* No measurement and entry closed. Reachable only if a caller sets
             openByDefault false on an unmeasured card; the prompt stays plain
             rather than apologetic, because nothing has gone wrong yet. */
          <button type="button" className={styles.correct} onClick={() => setOpen(true)}>
            Enter the size of the floor
          </button>
        )
      )}

      {open && (
        <div className={styles.entry}>
          <p className={styles.entryHead}>
            {known ? 'Enter the size yourself' : 'How big is the floor?'}
          </p>
          <p className={styles.entryNote}>
            Measure the longest wall and the widest point. Include anywhere the
            coating goes; leave out anything permanently fixed to the slab.
          </p>

          <div className={styles.modes} role="group" aria-label="How to enter the size">
            <button
              type="button"
              className={mode === 'dimensions' ? `${styles.mode} ${styles.modeOn}` : styles.mode}
              aria-pressed={mode === 'dimensions'}
              onClick={() => {
                setMode('dimensions');
                setTouched(false);
              }}
            >
              Length × width
            </button>
            <button
              type="button"
              className={mode === 'total' ? `${styles.mode} ${styles.modeOn}` : styles.mode}
              aria-pressed={mode === 'total'}
              onClick={() => {
                setMode('total');
                setTouched(false);
              }}
            >
              I know the area
            </button>
          </div>

          {mode === 'dimensions' ? (
            <div className={styles.fields}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Length</span>
                <input
                  className={styles.input}
                  /* type="number" gives the numeric keypad and the visitor's
                     own decimal separator. inputMode="decimal" because some
                     Android keyboards omit the point otherwise, which makes
                     3.7 m impossible to type. */
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  placeholder="0"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                />
              </label>
              <span aria-hidden className={styles.times}>
                ×
              </span>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Width</span>
                <input
                  className={styles.input}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  placeholder="0"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Units</span>
                <select
                  className={styles.select}
                  value={lengthUnit}
                  onChange={(e) => setLengthUnit(e.target.value as LengthUnitId)}
                >
                  {LENGTH_UNITS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className={styles.fields}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Total area</span>
                <input
                  className={styles.input}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  placeholder="0"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Units</span>
                <select
                  className={styles.select}
                  value={areaUnit}
                  onChange={(e) => setAreaUnit(e.target.value as AreaUnitId)}
                >
                  {AREA_UNITS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* ------------------------------------------------------------
              THE RUNNING CONVERSION.

              Shown live, before anything is confirmed, and it echoes the
              visitor's own numbers in his own units first: "3.7 m × 5.5 m —
              that is 219 sq ft". Somebody who can see his measurement inside
              the sentence can tell at a glance whether the conversion did what
              he expected. Without the echo, a metric entry produces a number
              from nowhere and there is no way to sanity-check it.
             ------------------------------------------------------------ */}
          {verdict.ok ? (
            <p className={styles.result} aria-live="polite">
              {echo ? `${echo} — that is ` : 'That is '}
              <span className={styles.resultFigure}>{formatSqft(verdict.sqft)}</span> sq ft.
            </p>
          ) : (
            /* Out-of-range is reported as soon as it is unambiguous, because a
               person who typed square inches wants to know now. 'incomplete'
               waits for a submit — see `touched`. */
            (touched || verdict.code !== 'incomplete') &&
            (raw !== null || touched) && (
              <p className={styles.problem} role="status">
                {verdict.message}
              </p>
            )
          )}

          <div className={styles.entryActions}>
            <button
              type="button"
              className="n15-btn n15-btn-primary"
              onClick={confirm}
              disabled={!verdict.ok}
            >
              Use this size
            </button>
            {known && (
              <button
                type="button"
                className="n15-btn n15-btn-ghost"
                onClick={() => {
                  setOpen(false);
                  setTouched(false);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
