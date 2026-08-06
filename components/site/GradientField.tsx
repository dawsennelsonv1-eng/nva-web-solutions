'use client';

import { useEffect, useRef } from 'react';

/**
 * components/site/GradientField.tsx — Phase 15A, Part 2.
 *
 * The living background AND the single input controller for the whole 15A
 * layer. It writes two unitless variables, --n15-x and --n15-y (each −1…1),
 * onto <html>; the field wrapper and the hero media read them in CSS calc()
 * transforms. One writer, any number of readers, all compositor-only.
 *
 * WHY LERP IN JS INSTEAD OF A CSS TRANSITION: pointermove fires faster than
 * the frame rate. The rAF loop coalesces input to one style write per frame
 * and eases toward the target at 8% per frame, which is what makes the field
 * feel weighted rather than twitchy — and it stops itself the moment the
 * value settles, so an idle page runs zero JavaScript.
 *
 * TILT: deviceorientation is used where it fires freely (Android). iOS 13+
 * gates it behind a permission prompt that requires a user gesture, and a
 * permission dialog is not a price worth paying for a subtle drift — on iOS
 * the field responds to touch instead, which pointermove already covers.
 *
 * Reduced motion: the effect returns before attaching anything. The tab-
 * hidden class is still maintained so the CSS keyframes (which reduced
 * motion has already disabled anyway) pause for everyone else.
 */
export function GradientField() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;

    const onVisibility = () => {
      root.classList.toggle('tab-hidden', document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
        root.classList.remove('tab-hidden');
      };
    }

    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;

    const step = () => {
      raf = 0;
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      root.style.setProperty('--n15-x', cx.toFixed(4));
      root.style.setProperty('--n15-y', cy.toFixed(4));
      if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) {
        raf = requestAnimationFrame(step);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(step);
    };

    const onPointer = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      schedule();
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      // gamma: left/right tilt. beta: front/back, ~40° is a natural hold.
      tx = Math.max(-1, Math.min(1, e.gamma / 30));
      ty = Math.max(-1, Math.min(1, (e.beta - 40) / 30));
      schedule();
    };

    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('deviceorientation', onTilt);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('deviceorientation', onTilt);
      if (raf) cancelAnimationFrame(raf);
      root.classList.remove('tab-hidden');
    };
  }, []);

  return (
    <div ref={ref} className="gf" aria-hidden="true">
      <div className="gf-wrap">
        <div className="gf-blob gf-a">
          <div className="gf-i" />
        </div>
        <div className="gf-blob gf-b">
          <div className="gf-i" />
        </div>
        <div className="gf-blob gf-c">
          <div className="gf-i" />
        </div>
      </div>
    </div>
  );
}
