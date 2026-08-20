'use client';

import { useState, useTransition } from 'react';
import { visualiseAction } from '@/app/actions/visualise';

/**
 * components/widget/FinishPreview.tsx — "SHOW ME MY FLOOR WITH THAT ON IT."
 *
 * ============================================================================
 * IT IS OPT-IN, AND THAT IS A COST DECISION AS MUCH AS A DESIGN ONE
 * ============================================================================
 *
 * Nothing renders until he presses the button. Two reasons, and both matter:
 *
 *   MONEY. A render costs ten to forty times a vision analysis. Firing one
 *   automatically for every visitor who reaches this step would spend the
 *   balance on people who never asked to see a picture, and the contractor
 *   pays for that.
 *
 *   ATTENTION. A person who has pressed a button is waiting on purpose. Ten
 *   seconds of a spinner he asked for reads as work; ten seconds he did not
 *   ask for reads as a broken page.
 *
 * ============================================================================
 * THE DISCLOSURE IS NOT DECORATION AND IS NOT DISMISSIBLE
 * ============================================================================
 *
 * It comes back from the server with the image, and it renders directly under
 * the image, every time, at a size a person actually reads. It is not a
 * tooltip, not behind an info icon, and not in a footer.
 *
 * The failure this prevents is concrete: a homeowner sees a beautiful render,
 * accepts a quote, receives a floor that does not match, and blames the
 * contractor — who blames the software. A render is a picture of an intention.
 * Saying so plainly, at the moment of looking, is what keeps this feature from
 * being a liability dressed as a feature.
 *
 * ============================================================================
 * BEFORE IS SHOWN NEXT TO AFTER
 * ============================================================================
 *
 * Deliberately not a slider or a fade toggle. Both hide one image to show the
 * other, and the question a homeowner is actually asking is "how different is
 * this from what I have now" — which is a comparison, not a reveal. Two
 * pictures side by side answer it in one glance and cost no interaction.
 *
 * It also makes a bad render obvious. If the model has moved a wall or invented
 * a window, it is visible immediately against the original rather than
 * discovered later by the contractor standing in the garage.
 */

export interface FinishPreviewProps {
  /** The homeowner's compressed photo. Null disables the whole feature. */
  photoBase64: string | null;
  photoMediaType: string | null;
  finishLabel: string;
  colourLabel?: string;
  colourHex?: string;
  surfaceLabel: string;
  sessionId: string;
  prototypeId: string | null;
  /**
   * Which vertical, and what the visitor actually chose. PHASE 83.
   *
   * WITHOUT THESE THE RENDER WAS BUILT FROM LABELS ALONE. The action resolves
   * material references and writes the finish description from the vertical's
   * own catalogue, and it could do neither without knowing which catalogue to
   * read — so every widget vertical was rendering against epoxy's assumptions
   * or against nothing.
   *
   * Both optional so an existing caller keeps compiling; the action defaults to
   * epoxy, which is what those callers meant.
   */
  vertical?: string;
  selections?: Record<string, string | string[] | undefined>;
  /** Fired when a render is stored, so the lead can carry the path. */
  onRendered?: (storagePath: string | null) => void;
}

export function FinishPreview({
  photoBase64,
  photoMediaType,
  finishLabel,
  colourLabel,
  colourHex,
  surfaceLabel,
  sessionId,
  prototypeId,
  vertical,
  selections,
  onRendered,
}: FinishPreviewProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [disclosure, setDisclosure] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // No photo, no preview. The step simply does not exist for somebody who
  // skipped the upload — which is a supported path, not an error.
  if (!photoBase64 || !photoMediaType) return null;

  const originalUrl = `data:${photoMediaType};base64,${photoBase64}`;

  const run = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await visualiseAction({
        photoBase64,
        photoMediaType,
        finishLabel,
        colourLabel,
        colourHex,
        surfaceLabel,
        sessionId,
        prototypeId,
        ...(vertical ? { vertical } : {}),
        ...(selections ? { selections } : {}),
      });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setDataUrl(result.dataUrl);
      setDisclosure(result.disclosure);
      onRendered?.(result.storagePath);
    });
  };

  return (
    <div className="mt-4 border-t border-rule pt-4">
      {!dataUrl && (
        <>
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="press min-h-[3rem] w-full rounded-milled border border-ink bg-sheet px-4 font-body text-base font-semibold text-ink disabled:opacity-60"
          >
            {pending ? 'Drawing it…' : `See ${finishLabel.toLowerCase()} on your ${surfaceLabel}`}
          </button>
          {pending && (
            <p className="mt-2 font-data text-2xs uppercase tracking-[0.08em] text-rule">
              This takes a few seconds. Your price is already worked out.
            </p>
          )}
        </>
      )}

      {message && <p className="mt-3 text-sm text-rule">{message}</p>}

      {dataUrl && (
        <figure className="m-0">
          <div className="grid grid-cols-2 gap-2">
            <div>
              {/* Plain <img>, not next/image: both sources are data URLs
                  generated at runtime, so there is nothing for the image
                  optimiser to fetch, resize or cache. Routing a data URL
                  through it would add a component and change nothing. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={originalUrl}
                alt="Your floor as it is now"
                className="block w-full border border-rule"
              />
              <span className="mt-1 block font-data text-2xs uppercase tracking-[0.08em] text-rule">
                Now
              </span>
            </div>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={dataUrl}
                alt={`Your floor with a ${finishLabel} finish drawn on`}
                className="block w-full border border-rule"
              />
              <span className="mt-1 block font-data text-2xs uppercase tracking-[0.08em] text-rule">
                {colourLabel ? `${finishLabel} · ${colourLabel}` : finishLabel}
              </span>
            </div>
          </div>

          {/* THE DISCLOSURE. Under the image, full size, always. */}
          {disclosure && (
            <figcaption className="mt-3 border border-rule bg-sheet p-3 text-sm">
              {disclosure}
            </figcaption>
          )}

          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="press mt-3 min-h-[3rem] w-full rounded-milled border border-ink bg-sheet px-4 font-body text-base font-semibold text-ink disabled:opacity-60"
          >
            {pending ? 'Drawing it…' : 'Draw it again'}
          </button>
          <p className="mt-2 font-data text-2xs uppercase tracking-[0.08em] text-rule">
            Every draw is a fresh render and costs your contractor money. Use it when the last one
            missed, not to browse.
          </p>
        </figure>
      )}
    </div>
  );
}
