'use client';

import { useCallback, useEffect, useRef, type CSSProperties } from 'react';

/**
 * components/site/AreaRule.tsx — the square-footage control on the tool card.
 *
 * ============================================================================
 * WHY THIS IS A NEW FILE AND NOT AN EDIT TO DatumRule
 * ============================================================================
 *
 * components/widget/DatumRule.tsx is the same idea in the OLD system: an
 * etched steel rule, ink-on-sheet, drawn with the legacy `--tick-*` custom
 * properties and Tailwind's `bg-rule` / `bg-hazard` tokens. It is mounted
 * inside the installed widget (StepArea) on every contractor's live site.
 *
 * Restyling it in place would therefore change the widget on production
 * deployments as a side effect of a marketing-page phase, which is exactly the
 * class of change the repo rules forbid. So DatumRule is untouched and keeps
 * serving the widget, and the card gets its own control in the 15B language.
 *
 * The two are not duplicates in any way that can drift: neither owns pricing.
 * Both are dumb value emitters and the arithmetic lives in lib/quote/pricing.
 *
 * ============================================================================
 * IT HAS TO FEEL GOOD UNDER A THUMB, WHICH IS A PERFORMANCE PROBLEM
 * ============================================================================
 *
 * Two things make a drag feel cheap: a handle that lags the finger, and a
 * readout that stutters. Both are caused by doing per-frame work in React.
 *
 *  - The TRACK FILL is a `transform: scaleX()` on a layer that already exists,
 *    not an animated width. Width is layout; scale is compositor.
 *  - The READOUT and the HANDLE are written straight to the DOM in the input
 *    handler. React still owns the value — the parent re-renders and reprices
 *    on the next frame — but the two things the eye is locked onto update in
 *    the same tick as the finger, so the control never feels loose.
 *
 * The real <input type="range"> carries the interaction, transparent and
 * full-height over the track. That keeps keyboard stepping, the platform's own
 * touch handling, and screen-reader announcement, none of which a div with
 * pointer handlers would have. The 44px height means the whole band is the
 * target, not just the 30px knob.
 */

export interface AreaRuleProps {
  min: number;
  max: number;
  value: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  unitSuffix?: string;
  /** Fired on pointerdown/up so the card can show its pressed state. */
  onDragStateChange?: (dragging: boolean) => void;
}

export function AreaRule({
  min,
  max,
  value,
  step = 10,
  onChange,
  label,
  unitSuffix = 'sq ft',
  onDragStateChange,
}: AreaRuleProps) {
  const readoutRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const fraction = useCallback(
    (v: number) => {
      if (max <= min) return 0;
      return (Math.min(max, Math.max(min, v)) - min) / (max - min);
    },
    [min, max]
  );

  /** One write, two readers: the fill scales by it, the knob is placed by it. */
  const paint = useCallback(
    (v: number) => {
      if (readoutRef.current) {
        readoutRef.current.textContent = Math.round(v).toLocaleString('en-US');
      }
      if (trackRef.current) {
        trackRef.current.style.setProperty('--ar-p', fraction(v).toFixed(4));
      }
    },
    [fraction]
  );

  // Keeps the painted state correct when the value changes from outside the
  // drag — a finish change does not move the rule, but a future caller
  // resetting it would, and a control that ignores its own prop is a bug
  // waiting for the first person to add a preset button.
  useEffect(() => {
    paint(value);
  }, [value, paint]);

  return (
    <div>
      <div className="ar-top">
        <span className="ar-label">{label}</span>
        <span className="ar-read">
          <span ref={readoutRef}>{Math.round(value).toLocaleString('en-US')}</span>
          <span className="ar-unit">{unitSuffix}</span>
        </span>
      </div>

      <div ref={trackRef} className="ar-track" style={{ '--ar-p': fraction(value) } as CSSProperties}>
        <div aria-hidden className="ar-rail">
          <span className="ar-fill" />
        </div>
        <div aria-hidden className="ar-knob" />
        <input
          className="ar-input"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            paint(v);
            onChange(v);
          }}
          onPointerDown={() => onDragStateChange?.(true)}
          onPointerUp={() => onDragStateChange?.(false)}
          onPointerCancel={() => onDragStateChange?.(false)}
          aria-label={label}
          aria-valuetext={Math.round(value).toLocaleString('en-US') + ' ' + unitSuffix}
        />
      </div>

      <div aria-hidden className="ar-hints">
        <span>{min.toLocaleString('en-US')}</span>
        <span>{max.toLocaleString('en-US')}</span>
      </div>
    </div>
  );
}
