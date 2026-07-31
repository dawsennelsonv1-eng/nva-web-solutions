'use client';

import { useRef, useState } from 'react';
import type { PipelineStage } from '@/lib/image/pipeline';
import { AnalysisMoment } from './AnalysisMoment';

/**
 * STEP 1 — "What are we coating?"
 *
 * Three real choices, sized as targets rather than listed in a select. A
 * dropdown on this step would be the first signal that this is a form; the
 * whole widget is trying to read as an instrument someone hands you.
 *
 * THE PIPELINE IS CODE-SPLIT HERE, and this is the only place it loads:
 * `await import('@/lib/image/pipeline')` runs inside the change handler, so
 * the EXIF reader and encoder are fetched at the instant a photo is chosen and
 * never for the visitor who types their numbers instead.
 */

export interface SurfaceOption {
  id: string;
  label: string;
  typicalSqft: { label: string; sqft: number }[];
}

export interface StepSurfaceProps {
  question: string;
  options: SurfaceOption[];
  selected: string | null;
  onSelect: (id: string) => void;
  onPhotoReady: (args: {
    base64: string;
    mediaType: string;
    previewUrl: string;
    originalBytes: number;
    finalBytes: number;
    durationMs: number;
  }) => void;
  onSkipPhoto: () => void;
  analyzing: boolean;
  /** Copy explaining why the instant estimate is off, when it is. */
  photoDisabledNote?: string | null;
}

const STAGE_COPY: Record<PipelineStage, string> = {
  reading: 'Reading the file',
  decoding: 'Opening the photo',
  resizing: 'Preparing it',
  encoding: 'Compressing',
  done: 'Sending',
};

export function StepSurface({
  question,
  options,
  selected,
  onSelect,
  onPhotoReady,
  onSkipPhoto,
  analyzing,
  photoDisabledNote,
}: StepSurfaceProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<PipelineStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStage('reading');
    try {
      const { processImage } = await import('@/lib/image/pipeline');
      const result = await processImage(file, { onStage: setStage });
      if (!result.ok) {
        setStage(null);
        setError(result.message);
        return;
      }
      setPreview(result.previewUrl);
      setStage(null);
      onPhotoReady({
        base64: result.base64,
        mediaType: result.mediaType,
        previewUrl: result.previewUrl,
        originalBytes: result.originalBytes,
        finalBytes: result.bytes,
        durationMs: result.durationMs,
      });
    } catch {
      setStage(null);
      setError('Something went wrong with that photo. Try another one, or skip it.');
    }
  }

  if (analyzing) return <AnalysisMoment previewUrl={preview} />;

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="font-display font-condensed text-xl font-bold">{question}</legend>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {options.map((o) => {
            const active = selected === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onSelect(o.id)}
                aria-pressed={active}
                className={
                  'flex min-h-[4.5rem] flex-col items-center justify-center rounded-milled border px-2 py-3 text-center transition-colors duration-step ' +
                  (active
                    ? 'border-ink bg-ink text-sheet'
                    : 'border-rule bg-sheet text-ink hover:border-ink')
                }
              >
                <span className="font-display font-condensed text-base font-bold uppercase tracking-wide">
                  {o.label}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        {photoDisabledNote ? (
          <p className="font-data text-sm text-rule">{photoDisabledNote}</p>
        ) : (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void handleFile(e.dataTransfer.files?.[0]);
              }}
              className={
                'rounded-milled border border-dashed p-4 transition-colors duration-step ' +
                (dragging ? 'border-hazard bg-hazard/5' : 'border-rule bg-sheet')
              }
            >
              <p className="font-data text-xs uppercase tracking-wide text-rule">
                Optional — speeds this up
              </p>
              <p className="mt-1 text-base">
                Add a photo of the floor and we&apos;ll read the condition off it.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex min-h-[2.75rem] items-center rounded-milled border border-ink bg-sheet px-4 text-base font-semibold text-ink"
                >
                  Take or choose a photo
                </button>
                <button
                  type="button"
                  onClick={onSkipPhoto}
                  className="inline-flex min-h-[2.75rem] items-center rounded-milled px-3 text-base text-rule underline-offset-4 hover:text-ink hover:underline"
                >
                  Skip
                </button>
              </div>

              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
            </div>

            {stage ? (
              <p className="mt-2 font-data text-sm text-ink" aria-live="polite">
                <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-hazard" />
                {STAGE_COPY[stage]}
              </p>
            ) : null}

            {error ? (
              <p className="mt-2 rounded-milled border border-danger/40 bg-danger/5 p-3 text-sm text-ink" role="alert">
                {error}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
