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
  /**
   * PHASE 3 OF THE CUSTOMER FLOW: start rendering the moment this mounts,
   * without waiting for a second tap.
   *
   * The button exists for the surfaces where the render is an OPTIONAL extra
   * beside a price that is already visible. Behind the contact gate it is not
   * optional — the visitor has just handed over his phone number for exactly
   * this, and putting one more button between him and the thing he paid for
   * with his details is the worst possible place to add a step.
   *
   * DEFAULT FALSE, so every existing mount behaves precisely as it did.
   */
  autoStart?: boolean;
  /**
   * Reported when a render completes, so the caller can attach the stored
   * copy to the lead it already wrote. Optional — a caller that does not care
   * omits it and nothing changes.
   */
  onRendered?: (storagePath: string | null) => void;
  /**
   * Fires once the attempt RESOLVES, either way.
   *
   * Distinct from onRendered because the caller needs to know the render is
   * over even when it failed. The price is revealed at that moment, and
   * hanging it on success alone would mean a visitor whose render errored
   * hands over his phone number and gets nothing at all — the one outcome
   * worse than no render.
   */
  onSettled?: (ok: boolean) => void;
  /**
   * The full description of the chosen finish, assembled from the picker's
   * selections. Falls back to finishLabel when absent, which is what every
   * pre-picker mount does.
   */
  finishDescription?: string;
  /**
   * The picker's raw choices, forwarded to the action so it can resolve the
   * material sample photographs ITSELF. The swatch URLs are deliberately not
   * sent from here — see app/actions/visualise.ts.
   */
  selections?: Record<string, string | string[] | undefined>;
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
  autoStart = false,
  onRendered,
  onSettled,
  finishDescription,
  selections,
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

  const runRef = useRef<(() => void) | null>(null);

  const run = () => {
    setPhase({ k: 'rendering' });
    renderedFor.current = finishLabel;
    void (async () => {
      try {
        const result = await visualiseAction({
          photoBase64: photo.base64,
          photoMediaType: photo.mediaType,
          // The picker's full description when there is one, so the model is
          // told "metallic epoxy floor with swirling copper and bronze
          // pigment, high gloss" rather than just "Metallic pour".
          finishLabel:
            finishDescription && finishDescription.trim().length > 0
              ? finishDescription
              : finishLabel,
          surfaceLabel,
          sessionId,
          prototypeId: null,
          ...(selections ? { selections } : {}),
        });
        if (!result.ok) {
          setPhase({ k: 'failed', message: result.message });
          onSettled?.(false);
          return;
        }
        setPhase({ k: 'done', afterUrl: result.dataUrl, disclosure: result.disclosure });
        onRendered?.(result.storagePath);
        onSettled?.(true);
      } catch {
        setPhase({ k: 'failed', message: 'That did not come back. Try it again.' });
        onSettled?.(false);
      }
    })();
  };

  /**
   * Fires ONCE per mount, and only from idle.
   *
   * `started` is a ref rather than a state flag because a render costs real
   * money and a re-render must never be able to start a second one. React 18
   * mounts effects twice in development StrictMode; without this guard that is
   * two paid image generations for every developer page load, and the bill
   * would arrive before anyone noticed the cause.
   *
   * It deliberately does NOT restart when the finish changes. The effect above
   * already resets to idle in that case, and auto-rendering every finish a
   * visitor taps through would spend the balance on curiosity.
   */
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || !enabled || started.current) return;
    started.current = true;
    runRef.current?.();
  }, [autoStart, enabled]);

  runRef.current = run;

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

