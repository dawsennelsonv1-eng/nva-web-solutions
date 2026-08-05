'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * components/widget/DatumRule.tsx — THE SIGNATURE ELEMENT.
 *
 * The square-footage control is not a slider with a track. It is a graduated
 * measurement scale — a steel rule etched into the sheet — and the value is
 * read off it the way a length is read off a tape. Minor graduations, major
 * graduations with numerals, and a machined indicator that sits ON the scale
 * rather than floating above it.
 *
 * WHY THIS SURVIVES prefers-reduced-motion, which was the Phase 0 requirement
 * the signature had to pass: the rule never animates. It is a static
 * instrument. Only the indicator moves, and it moves because the user is
 * moving it — that is direct manipulation, not animation. With reduced motion
 * every transition duration in globals.css collapses to 0ms and this control
 * is completely unchanged, because there was nothing decorative to remove.
 *
 * ACCESSIBILITY: a real <input type="range"> carries the interaction. It is
 * transparent, not display:none, so it keeps keyboard stepping, screen-reader
 * announcement, and the platform's own touch target. The painted rule beneath
 * is aria-hidden decoration over a working control, never a replacement for
 * one.
 */

export interface DatumRuleProps {
  min: number;
  max: number;
  value: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  unitSuffix?: string;
  disabled?: boolean;
}

/** Graduation spacing that yields a readable number of majors at any range. */
function graduations(min: number, max: number) {
  const span = max - min;
  const roughMajor = span / 6;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughMajor)));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * magnitude);
  const major = candidates.find((c) => c >= roughMajor) ?? magnitude * 10;
  const minor = major / 5;
  const majors: number[] = [];
  const minors: number[] = [];
  const first = Math.ceil(min / minor) * minor;
  for (let v = first; v <= max + 0.001; v += minor) {
    const rounded = Math.round(v * 1000) / 1000;
    if (Math.abs(rounded / major - Math.round(rounded / major)) < 0.001) majors.push(rounded);
    else minors.push(rounded);
  }
  return { majors, minors };
}

export function DatumRule({
  min,
  max,
  value,
  step = 10,
  onChange,
  label,
  unitSuffix = 'sq ft',
  disabled = false,
}: DatumRuleProps) {
  const readoutRef = useRef<HTMLSpanElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const { majors, minors } = useMemo(() => graduations(min, max), [min, max]);

  const pct = useCallback(
    (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100,
    [min, max]
  );

  /**
   * The readout is written straight to the DOM rather than rendered from
   * state. Dragging fires many times a second; re-rendering the whole widget
   * on every one of those makes the number stutter on a mid-range Android,
   * and a stuttering measurement is the one thing an instrument may not do.
   * React still owns the value — this is a display fast-path, not a second
   * source of truth.
   */
  useEffect(() => {
    if (readoutRef.current) readoutRef.current.textContent = Math.round(value).toLocaleString('en-US');
    if (indicatorRef.current) indicatorRef.current.style.left = pct(value) + '%';
  }, [value, pct]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    if (readoutRef.current) readoutRef.current.textContent = Math.round(v).toLocaleString('en-US');
    if (indicatorRef.current) indicatorRef.current.style.left = pct(v) + '%';
    onChange(v);
  };

  return (
    <div className="w-full select-none">
      <div className="flex items-baseline justify-between">
        <span className="font-data text-xs uppercase tracking-wide text-rule">{label}</span>
        <span className="font-data text-sm text-ink">
          <span ref={readoutRef} className="tabular text-lg font-medium">
            {Math.round(value).toLocaleString('en-US')}
          </span>
          <span className="ml-1 text-rule">{unitSuffix}</span>
        </span>
      </div>

      <div className="relative mt-3 h-14">
        {/* the scale */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-8">
          <div className="absolute inset-x-0 top-0 h-px bg-rule" />
          {minors.map((v) => (
            <span
              key={'m' + v}
              className="absolute top-0 bg-rule"
              style={{ left: pct(v) + '%', width: 'var(--tick-w)', height: 'var(--tick-minor)' }}
            />
          ))}
          {majors.map((v) => (
            <span key={'M' + v}>
              <span
                className="absolute top-0 bg-ink"
                style={{ left: pct(v) + '%', width: 'var(--tick-w)', height: 'var(--tick-major)' }}
              />
              <span
                className="tabular absolute top-3.5 -translate-x-1/2 font-data text-xs text-rule"
                style={{ left: pct(v) + '%' }}
              >
                {v >= 1000 ? v / 1000 + 'k' : v}
              </span>
            </span>
          ))}
        </div>

        {/* the indicator: a machined block riding the scale, not a floating dot */}
        {/* 13D: the left-property transition that was on this element (a
            step-duration ease-out) is REMOVED, for two reasons that point the
            same way. Its class name is described rather than written out
            because Tailwind scans comments too, and naming it here would emit
            the dead rule this change exists to delete.

            Correctness: this file's own header says the indicator "moves
            because the user is moving it — that is direct manipulation, not
            animation." A 180ms transition on a dragged control contradicts
            that. It made the indicator lag roughly a fifth of a second behind
            the thumb, which on an instrument reads as the scale being loose.

            Performance: `left` is a layout property. Transitioning it meant
            the browser recomputed layout for this element on every frame of
            every drag, on top of the frames the drag itself produces. 13D
            requires 60fps with the slider under a thumb on a mid-range
            Android, and this was the one place in the widget paying layout
            cost per frame for no visible benefit.

            The indicator now snaps to wherever the finger is. `left` is still
            used for POSITION — that write happens once per input event, not
            once per frame of an interpolation, and it is the same write the
            DOM fast-path above was already making. */}
        <div
          ref={indicatorRef}
          aria-hidden
          className="pointer-events-none absolute top-0"
          style={{ left: pct(value) + '%' }}
        >
          <div className="-translate-x-1/2">
            <div className="h-8 w-0.5 bg-hazard" />
            <div className="mx-auto h-2 w-3 rounded-milled bg-hazard" />
          </div>
        </div>

        {/* the real control */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={handleInput}
          aria-label={label}
          aria-valuetext={Math.round(value).toLocaleString('en-US') + ' ' + unitSuffix}
          className="absolute inset-x-0 top-0 h-11 w-full cursor-ew-resize appearance-none bg-transparent opacity-0"
        />
      </div>
    </div>
  );
}

