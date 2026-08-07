'use client';

import { useEffect, useRef, useState } from 'react';
import { visualiseAction } from '@/app/actions/visualise';

/**
 * components/site/FinishVisualiser.tsx — PHASE 16C: RENDER ONLY.
 *
 * ============================================================================
 * WHAT CHANGED, AND WHY IT HAD TO
 * ============================================================================
 *
 * Until now this component owned the photo: it showed the invitation, opened
 * the camera, ran the pipeline, then rendered. That made sense when the card
 * was a pricer with a preview bolted on the end.
 *
 * The card is now photo-first — one upload drives the size estimate, the price
 * AND the render — so the photo has to be owned one level up, in ToolCard.
 * Otherwise the visitor is asked for the same garage twice, which is the exact
 * opposite of the "less manual, feels automatic" goal this phase exists for.
 *
 * So this file no longer touches the camera or lib/image/pipeline. It receives
 * an already-prepared image and does one thing: turn it into a render.
 *
 * THE SERVER PATH UNDERNEATH IS COMPLETELY UNCHANGED — visualiseAction, its
 * per-IP limit, its payload validation, its daily ceiling, its disclosure.
 * Nothing about what costs money moved. Only who holds the file.
 */

export interface PreparedPhoto {
  base64: string;
  mediaType: string;
  previewUrl: string;
}

export interface FinishVisualiserProps {
  enabled: boolean;
  photo: PreparedPhoto;
  finishLabel: string;
  surfaceLabel: string;
  sessionId: string;
}

type Phase =
  | { k: 'idle' }
  | { k: 'rendering' }
  | { k: 'done'; afterUrl: string; disclosure: string }
  | { k: 'failed'; message: string };

export function FinishVisualiser({
  enabled,
  photo,
  finishLabel,
  surfaceLabel,
  sessionId,
}: FinishVisualiserProps) {
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });

  /**
   * A render belongs to the finish that was selected when it ran. If the
   * visitor changes finish afterwards, the result is cleared.
   *
   * Leaving it would caption a metallic render "decorative flakes" — a picture
   * lying about what it shows, on the page whose whole argument is that nothing
   * here is faked. Clearing costs him a tap; keeping it costs the argument.
   *
   * It does NOT re-render automatically. That would spend money on a finish he
   * may have only glanced at.
   */
  const renderedFor = useRef<string | null>(null);
  useEffect(() => {
    if (renderedFor.current !== null && renderedFor.current !== finishLabel) {
      setPhase({ k: 'idle' });
    }
  }, [finishLabel]);

  if (!enabled) {
    return (
      <p className="tc-up-note">
        The photo preview is switched off on this deployment. Everything else
        here is live.
      </p>
    );
  }

  const run = () => {
    setPhase({ k: 'rendering' });
    renderedFor.current = finishLabel;
    void (async () => {
      try {
        const result = await visualiseAction({
          photoBase64: photo.base64,
          photoMediaType: photo.mediaType,
          finishLabel,
          surfaceLabel,
          sessionId,
          prototypeId: null,
        });
        if (!result.ok) {
          setPhase({ k: 'failed', message: result.message });
          return;
        }
        setPhase({ k: 'done', afterUrl: result.dataUrl, disclosure: result.disclosure });
      } catch {
        setPhase({ k: 'failed', message: 'That did not come back. Try it again.' });
      }
    })();
  };

  return (
    <div className="tc-render">
      {phase.k === 'idle' && (
        <>
          <button type="button" className="n15-btn n15-btn-ghost tc-render-go" onClick={run}>
            Show me this on my floor
          </button>
          <p className="tc-up-note">Uses the photo you already sent. About thirty seconds.</p>
        </>
      )}

      {phase.k === 'rendering' && (
        <p className="tc-up-stage" aria-live="polite">
          Putting {finishLabel.toLowerCase()} on your floor. About thirty seconds.
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
              {/* Plain <img>: a blob: URL and a data: URL, neither of which
                  next/image can optimise. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.previewUrl} alt="The floor as you photographed it" />
              <figcaption className="tc-shot-cap">Your photo</figcaption>
            </figure>
            <figure className="tc-shot">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={phase.afterUrl} alt={'The same floor with ' + finishLabel + ' applied'} />
              <figcaption className="tc-shot-cap">{finishLabel}</figcaption>
            </figure>
          </div>
          {/* Printed verbatim, beside the image. A render that reaches a screen
              without it is the one failure this feature was built to avoid. */}
          <p className="tc-disclosure">{phase.disclosure}</p>
        </>
      )}
    </div>
  );
}
