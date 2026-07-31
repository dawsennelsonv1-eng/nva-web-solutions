'use client';

import { useEffect, useState } from 'react';
import { m } from '@/lib/motion';

/**
 * components/widget/AnalysisMoment.tsx — the highest-leverage animation in the
 * product.
 *
 * This is the moment the contractor decides whether the thing is real. It has
 * to read as a machine measuring a surface, not as a spinner with a caption.
 * So: a scan traverses HIS photo on the --t-scan cadence, graduation marks
 * light as it passes, and the readout below names what is being resolved in
 * the order a person would actually inspect a floor — surface, then
 * condition, then the specific defects.
 *
 * WHAT DOES NOT MOVE, which matters as much as what does: the photo itself is
 * perfectly still, the frame is still, the type is still. One element travels.
 * A busy loading state communicates "we are working"; a single instrument pass
 * communicates "we are measuring", and only one of those is worth $250 a month.
 *
 * REDUCED MOTION: the scan is not rendered at all. The frame, the photo and a
 * settled "Reading the photo" readout appear immediately, with the same layout
 * and the same weight, so the step still looks finished rather than broken.
 */

const READOUT_STEPS = [
  'Resolving surface',
  'Grading condition',
  'Checking for staining and cracking',
  'Estimating area',
];

export function AnalysisMoment({ previewUrl }: { previewUrl: string | null }) {
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % READOUT_STEPS.length), 1400);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    <div className="w-full">
      <div className="relative overflow-hidden rounded-milled border bg-sheet">
        <div className="relative aspect-[4/3] w-full bg-concrete">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="The floor being analysed"
              className="h-full w-full object-cover"
            />
          ) : null}

          {!reduced ? (
            <>
              <m.div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 h-px bg-hazard"
                initial={{ top: '0%' }}
                animate={{ top: ['0%', '100%', '0%'] }}
                transition={{ duration: 2.8, ease: 'easeInOut', repeat: Infinity }}
              />
              <m.div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 h-16"
                style={{
                  background:
                    'linear-gradient(to bottom, rgb(var(--c-hazard) / 0) 0%, rgb(var(--c-hazard) / 0.14) 100%)',
                }}
                initial={{ top: '-4rem' }}
                animate={{ top: ['-4rem', 'calc(100% - 0rem)', '-4rem'] }}
                transition={{ duration: 2.8, ease: 'easeInOut', repeat: Infinity }}
              />
            </>
          ) : null}

          {/* corner registration marks: the frame reads as an instrument bed */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {[
              'left-2 top-2 border-l border-t',
              'right-2 top-2 border-r border-t',
              'left-2 bottom-2 border-b border-l',
              'right-2 bottom-2 border-b border-r',
            ].map((cls) => (
              <span key={cls} className={'absolute h-4 w-4 border-sheet/80 ' + cls} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2" aria-live="polite">
        <span className="h-1.5 w-1.5 rounded-full bg-hazard" aria-hidden />
        <span className="font-data text-sm text-ink">
          {reduced ? 'Reading the photo' : READOUT_STEPS[index]}
        </span>
      </div>
    </div>
  );
}
