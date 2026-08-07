'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PipelineStage } from '@/lib/image/pipeline';
import { visualiseAction } from '@/app/actions/visualise';

/**
 * components/site/FinishVisualiser.tsx — "Upload a photo of your garage and
 * see it finished."
 *
 * ============================================================================
 * IT ROUTES INTO THE EXISTING RENDER PATH. THERE IS NO SECOND ONE.
 * ============================================================================
 *
 * The entire path this mounts on top of already existed and is unchanged:
 *
 *   this file
 *     -> lib/image/pipeline.processImage        (client, code-split)
 *     -> app/actions/visualise.visualiseAction  (server action)
 *          -> checkIpRateLimit        lib/quote/guards
 *          -> validateImagePayload    lib/quote/guards
 *          -> lib/ai/visualise.visualiseFinish
 *               -> checkBudget        lib/ai/budget
 *               -> renderFinishImage  lib/ai/images   (OpenRouter /v1/images)
 *               -> uploadFloorPhoto   lib/storage/photos
 *               -> recordAiJob        lib/ai/jobs
 *
 * Nothing in that chain is modified by this phase. This component supplies the
 * arguments and renders the result, and that is deliberately all it does.
 *
 * The pipeline is reached with a dynamic import inside the file handler, the
 * same way StepSurface reaches it, so the EXIF reader and the WebP encoder are
 * fetched at the moment a photo is chosen and never enter the bundle of a
 * visitor who only drags the rule — which is nearly all of them, and which is
 * a real part of the first-load budget for this page.
 *
 * ============================================================================
 * WHAT IS SHOWN BEFORE A RENDER EXISTS
 * ============================================================================
 *
 * NOTHING IS FABRICATED HERE. There is no example render, no simulated
 * before/after, and no illustrative image of somebody else's floor. Until a
 * real before/after pair is supplied, the invitation is words and the two
 * frames appear only once the visitor's own photo has been through the model.
 *
 * When the pair IS supplied, drop the files in and set BEFORE_AFTER below —
 * one constant, and the labels are already written to say whose floor it is.
 *
 * ============================================================================
 * IT DISABLES ITSELF RATHER THAN FAILING
 * ============================================================================
 *
 * `enabled` is computed on the SERVER from the presence of OPENROUTER_API_KEY
 * (see ToolDeck) and passed down. Without a key, lib/ai/images returns
 * 'not_configured' and every attempt would end in a polite error after a
 * round trip — a button that always fails. So the invitation renders visibly
 * inert with a plain note instead, which is the phase's own instruction.
 *
 * That check is a necessary condition, not a sufficient one. A key can be
 * present and the model slugs stale; only a real render proves the path.
 */

const BEFORE_AFTER: { before: string; after: string } | null = null;

const STAGE_COPY: Record<PipelineStage, string> = {
  reading: 'Reading the file',
  decoding: 'Opening the photo',
  resizing: 'Preparing it',
  encoding: 'Compressing',
  done: 'Sending it over',
};

export interface FinishVisualiserProps {
  /** False when OPENROUTER_API_KEY is absent on the server. */
  enabled: boolean;
  /** e.g. 'Metallic epoxy'. Comes from the selected finish, never typed here. */
  finishLabel: string;
  /** e.g. 'garage'. Names the surface for the prompt; prices nothing. */
  surfaceLabel: string;
  /** Stable per visitor per card, so the stored render can be correlated. */
  sessionId: string;
}

type Phase =
  | { k: 'idle' }
  | { k: 'preparing'; stage: PipelineStage }
  | { k: 'rendering' }
  | { k: 'done'; beforeUrl: string; afterUrl: string; disclosure: string }
  | { k: 'failed'; message: string };

export function FinishVisualiser({
  enabled,
  finishLabel,
  surfaceLabel,
  sessionId,
}: FinishVisualiserProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const [hot, setHot] = useState(false);

  // Object URLs are revoked on unmount. Without this every photo a visitor
  // tries leaks a blob for the life of the tab, and this is a page people
  // scroll up and down while deciding.
  const urls = useRef<string[]>([]);
  useEffect(() => {
    const held = urls.current;
    return () => {
      for (const u of held) URL.revokeObjectURL(u);
    };
  }, []);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !enabled) return;

      setPhase({ k: 'preparing', stage: 'reading' });
      try {
        const { processImage } = await import('@/lib/image/pipeline');
        const prepared = await processImage(file, {
          onStage: (stage) => setPhase({ k: 'preparing', stage }),
        });

        if (!prepared.ok) {
          setPhase({ k: 'failed', message: prepared.message });
          return;
        }
        urls.current.push(prepared.previewUrl);

        setPhase({ k: 'rendering' });
        const result = await visualiseAction({
          photoBase64: prepared.base64,
          photoMediaType: prepared.mediaType,
          finishLabel,
          surfaceLabel,
          sessionId,
          // No prototype: this is the marketing page, not an installed widget
          // on a contractor's site. The ai_jobs row is written with a null
          // prototype_id, which is what makes homepage spend separable from a
          // customer's in the ledger.
          prototypeId: null,
        });

        if (!result.ok) {
          setPhase({ k: 'failed', message: result.message });
          return;
        }

        setPhase({
          k: 'done',
          beforeUrl: prepared.previewUrl,
          afterUrl: result.dataUrl,
          disclosure: result.disclosure,
        });
      } catch {
        setPhase({
          k: 'failed',
          message: 'That photo could not be prepared. Try another one.',
        });
      }
    },
    [enabled, finishLabel, surfaceLabel, sessionId]
  );

  if (!enabled) {
    return (
      <div className="tc-up" aria-disabled="true" style={{ opacity: 0.55 }}>
        <p className="tc-up-h">See your floor finished</p>
        <p className="tc-up-sub">
          The photo preview is switched off on this deployment. Everything else on
          this card works, and the price above is the real engine.
        </p>
      </div>
    );
  }

  const busy = phase.k === 'preparing' || phase.k === 'rendering';

  return (
    <div
      className={'tc-up' + (hot ? ' tc-up-hot' : '')}
      onDragOver={(e) => {
        e.preventDefault();
        setHot(true);
      }}
      onDragLeave={() => setHot(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHot(false);
        void handleFile(e.dataTransfer.files?.[0]);
      }}
    >
      <p className="tc-up-h">Upload a photo of your garage and see it finished</p>
      <p className="tc-up-sub">
        Your own floor, with {finishLabel.toLowerCase()} on it, in about half a
        minute. Point your camera at it — you do not need to tidy up first.
      </p>

      <div className="tc-up-actions">
        <button
          type="button"
          className="n15-btn n15-btn-primary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Working…' : 'Take or choose a photo'}
        </button>
      </div>

      {/* capture="environment" opens the rear camera on Android and falls back
          to the file picker everywhere else, including desktop, where the drop
          zone above is the primary path. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {phase.k === 'preparing' && (
        <p className="tc-up-stage" aria-live="polite">
          {STAGE_COPY[phase.stage]}
        </p>
      )}
      {phase.k === 'rendering' && (
        <p className="tc-up-stage" aria-live="polite">
          Painting the floor. This takes about thirty seconds.
        </p>
      )}

      {phase.k === 'failed' && (
        <p className="tc-up-err" role="alert">
          {phase.message}
        </p>
      )}

      {phase.k === 'done' && (
        <>
          <div className="tc-up-shots">
            <figure className="tc-shot">
              {/* Deliberately a plain <img>: these are a blob: URL and a data:
                  URL, neither of which next/image can optimise, and routing
                  them through the optimiser would 400. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={phase.beforeUrl} alt="The floor as you photographed it" />
              <figcaption className="tc-shot-cap">Your photo</figcaption>
            </figure>
            <figure className="tc-shot">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={phase.afterUrl} alt={'The same floor with ' + finishLabel + ' applied'} />
              <figcaption className="tc-shot-cap">{finishLabel}</figcaption>
            </figure>
          </div>
          {/* The disclosure travels with the render from lib/ai/visualise and
              is printed verbatim. A caller that shows the image without it has
              dropped the one thing that makes the feature safe. */}
          <p className="tc-disclosure">{phase.disclosure}</p>
        </>
      )}

      {phase.k === 'idle' && BEFORE_AFTER === null && (
        <p className="tc-up-note">
          Nothing is generated until you send a photo, and what comes back is
          your room with the coating on it — not a stock picture of someone
          else&apos;s garage.
        </p>
      )}
    </div>
  );
}
