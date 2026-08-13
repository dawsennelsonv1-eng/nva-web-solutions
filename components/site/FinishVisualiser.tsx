'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
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

/**
 * The operator diagnostic block.
 *
 * INLINE STYLES, and the reasoning is the same as the matching block in
 * ToolCard.tsx: this element only exists behind `?debug=1`, no visitor ever
 * sees it, and giving it a class would mean a phase layer and an edit to
 * app/layout.tsx for four lines of debugging text. It is not part of the
 * design, so it does not go in the design system.
 */
const DIAG_STYLE: CSSProperties = {
  marginTop: '0.75rem',
  padding: '0.6rem 0.7rem',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.7rem',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  opacity: 0.75,
  border: '1px solid currentColor',
  borderRadius: '0.4rem',
};

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
  /**
   * `diagnostic` is the operator's copy: the failure code and every model the
   * chain tried, with what each one said. Printed ONLY under `?debug=1`, the
   * same switch ToolCard uses for the measurement. A homeowner sees `message`
   * and nothing else, ever.
   */
  | {
      k: 'failed';
      message: string;
      diagnostic?: string[];
      /**
       * A fault in our own code, shown to everyone. See the render block for
       * why this one is not gated behind ?debug=1.
       */
      serverFault?: string;
    };

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

  /**
   * ==========================================================================
   * EVERY HOOK IS DECLARED HERE, ABOVE THE `enabled` EARLY RETURN.
   * ==========================================================================
   *
   * These three sat BELOW it and failed the build on react-hooks/rules-of-hooks.
   * The rule is not a style preference: React identifies hook state by CALL
   * ORDER, so a component that returns early before its fourth hook has a
   * different hook count on that render than on the next. State then belongs to
   * the wrong hook — a ref reads as a piece of state, an effect fires with
   * another effect's dependencies.
   *
   * Here that would be live on a real toggle, not a theoretical one: `enabled`
   * is driven by whether the visualiser is configured for the deployment, so a
   * site could flip between the two branches and silently corrupt which render
   * belonged to which finish.
   *
   * `runRef` exists so the auto-start effect can call the latest `run` without
   * listing it as a dependency — `run` is redefined on every render and would
   * retrigger the effect, which is a paid image generation per render.
   */
  const runRef = useRef<(() => void) | null>(null);

  /**
   * `?debug=1`. Declared HERE, with the other hooks and above the `enabled`
   * early return, for the reason spelled out in the block comment above:
   * React identifies hook state by call order, and a hook placed below that
   * return would belong to the wrong slot on the renders where `enabled` is
   * false. Read in an effect because `window` does not exist on the server and
   * reading it in the initial useState value is a hydration mismatch.
   */
  const [debug, setDebug] = useState(false);
  useEffect(() => {
    try {
      setDebug(new URLSearchParams(window.location.search).get('debug') === '1');
    } catch {
      /* a browser that will not parse its own URL is not worth a crash */
    }
  }, []);

  /**
   * Fires ONCE per mount, and only from idle.
   *
   * A ref rather than state because a render costs real money and a re-render
   * must never start a second one. React 18 mounts effects twice in
   * development StrictMode; without this guard that is two paid image
   * generations per developer page load, and the bill arrives before anyone
   * notices the cause.
   *
   * It deliberately does NOT restart when the finish changes — the effect above
   * resets to idle in that case, and auto-rendering every finish somebody taps
   * through would spend the balance on curiosity. ToolCard remounts this with a
   * new key when the visitor explicitly asks for a fresh one.
   */
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || !enabled || started.current) return;
    started.current = true;
    runRef.current?.();
  }, [autoStart, enabled]);

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
          setPhase({
            k: 'failed',
            message: result.message,
            ...(result.failure
              ? {
                  diagnostic: [
                    result.failure.code +
                      (result.failure.detail ? ': ' + result.failure.detail : ''),
                    ...result.failure.attempts,
                  ],
                  ...(result.failure.code === 'server_exception' && result.failure.detail
                    ? { serverFault: result.failure.detail }
                    : {}),
                }
              : {}),
          });
          onSettled?.(false);
          return;
        }
        setPhase({ k: 'done', afterUrl: result.dataUrl, disclosure: result.disclosure });
        onRendered?.(result.storagePath);
        onSettled?.(true);
      } catch (e) {
        /**
         * ==================================================================
         * "THAT DID NOT COME BACK. TRY IT AGAIN." WAS HERE, AND IT WAS THE
         * ONLY THING ON SCREEN WHEN THE RENDER BROKE.
         * ==================================================================
         *
         * It named nothing, blamed nothing, and suggested the one action that
         * could not help — because a throw at THIS call site is never a
         * transient hiccup worth retrying.
         *
         * `visualiseAction` is written never to throw: every internal failure,
         * including a chain-exhausted render, returns `{ ok: false }` with a
         * message. So an exception here means the request never reached the
         * function body at all. In practice that is one of two things:
         *
         *   - The network dropped mid-request.
         *   - Next rejected the Server Action before dispatch, almost always
         *     on the body size limit. This action posts one photograph as
         *     base64, up to roughly 683 KB against what used to be a 1 MB
         *     default with no configuration behind it (see next.config.mjs,
         *     raised to 8mb in phase 1). Tight enough that a high-texture
         *     concrete photo could tip it while a clean one sailed through —
         *     which is exactly the intermittent, unattributable failure that
         *     was being reported.
         *
         * Neither is fixed by tapping a button again, so the copy no longer
         * pretends otherwise, and the real error is captured for `?debug=1`
         * instead of being swallowed.
         */
        const detail = e instanceof Error ? e.name + ': ' + e.message : String(e);
        setPhase({
          k: 'failed',
          message:
            'The preview could not be sent. Check your connection — your quote and your details are unaffected.',
          diagnostic: ['client_exception: ' + detail],
          /**
           * ALSO SHOWN WITHOUT ?debug=1 NOW.
           *
           * With visualiseAction wrapped, a throw at THIS call site can no
           * longer be a fault inside the action — it is the transport itself:
           * the request never arrived, or the response never came back. That
           * is a narrow and non-sensitive set of causes, and naming it is what
           * separates "the server broke" from "the network broke" without
           * anybody having to edit a URL on a phone.
           */
          serverFault: 'client_exception: ' + detail,
        });
        onSettled?.(false);
      }
    })();
  };

  // Kept current so the auto-start effect above always calls the latest
  // closure. Assigning during render is safe for a ref that nothing reads
  // during render — only the effect reads it, after commit.
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
        <>
          <p className="tc-up-err" role="alert">
            {phase.message}
          </p>
          {/* THE RETRY IS OFFERED, BUT NOT PROMISED.

              A failed render leaves the visitor with a price and a
              specification and no picture. Some of these failures are worth
              one more attempt — a rate limit, a timeout, an overloaded
              provider. None of them were reachable before: the failed branch
              rendered a sentence and nothing else, so a render that fell over
              was permanently over for that session, and the only route back
              was reloading the page and losing the whole flow. */}
          <button type="button" className="n15-btn n15-btn-ghost tc-render-go" onClick={run}>
            Try the preview again
          </button>
          {/* ----------------------------------------------------------------
              THE REASON, SHOWN WITHOUT `?debug=1`.

              The diagnostic was operator-only because it names models,
              providers and HTTP statuses — none of which a homeowner can use,
              and some of which are competitive information.

              A SERVER EXCEPTION IS DIFFERENT. It carries no model and no
              vendor: it is the name and message of something that broke in our
              own code. Nothing about "TypeError: x is not a function" tells a
              competitor anything, and hiding it behind a query parameter is
              what made this failure anonymous for days.

              So the exception line shows to everyone. It is small, it sits
              below plain-language copy that already explains the fault is
              ours, and it is the difference between a bug that reports itself
              and one that has to be guessed at from a phone.

              Everything else — chain failures, rate limits, model names — is
              still gated behind ?debug=1 exactly as before.
             ---------------------------------------------------------------- */}
          {phase.serverFault && (
            <pre style={DIAG_STYLE}>{phase.serverFault}</pre>
          )}
          {debug && phase.diagnostic && phase.diagnostic.length > 0 && (
            <pre style={DIAG_STYLE}>{phase.diagnostic.join('\n')}</pre>
          )}
        </>
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
