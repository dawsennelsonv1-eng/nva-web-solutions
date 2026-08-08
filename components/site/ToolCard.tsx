'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AreaRule } from '@/components/site/AreaRule';
import { FinishVisualiser, type PreparedPhoto } from '@/components/site/FinishVisualiser';
import { MediaGallery } from '@/components/tools/MediaGallery';
import { analyzePhotoAction } from '@/app/actions/quote';
import { calculateQuote, type PricingRules } from '@/lib/quote/pricing';
import { finishPhotoFor } from '@/lib/site/finish-photos';
// media-types rather than media. This was already legal — a type-only import
// is erased before webpack sees it — but pointing a client component at a
// server-only module is a trap: the day somebody adds MIN_SLOTS to this line
// the build breaks with an error that names the wrong cause.
import type { MediaSlot } from '@/lib/tools/media-types';
import type { PipelineStage } from '@/lib/image/pipeline';

/**
 * components/site/ToolCard.tsx — PHASE 16C: PHOTO FIRST.
 *
 * ============================================================================
 * THE FLOW IS INVERTED, AND THAT IS THE POINT OF THIS PHASE
 * ============================================================================
 *
 * Before: drag a slider, pick a finish, see a price, then optionally upload a
 * photo for a preview. Every number came from the visitor.
 *
 * Now: send one photo. The model reads it, estimates the area, and the card
 * comes back with a size already filled in, a price already calculated, and the
 * option to see the finish on that same floor. The visitor confirms rather than
 * supplies.
 *
 * That matters because MOST PEOPLE DO NOT KNOW THEIR SQUARE FOOTAGE. Opening
 * with a slider asks a question the visitor cannot answer, and a control you
 * cannot answer is where a visitor leaves. A photograph of a garage is
 * something everyone has.
 *
 * ============================================================================
 * THE BAR IS DELIBERATELY QUIET
 * ============================================================================
 *
 * The estimate is presented as a SENTENCE — "Looks like about 480 sq ft" — with
 * a small "Not right?" underneath. The rule only appears if he asks for it.
 *
 * A prominent slider next to an AI estimate reads as "we guessed, now do it
 * properly", which puts the manual work back and makes the automatic part feel
 * untrustworthy. Hiding it makes the estimate feel like an answer. The
 * correction is one tap away for the minority who want it.
 *
 * WHEN THE MODEL IS NOT SURE, THE RULE OPENS BY DEFAULT and the wording changes
 * to ask rather than to tell. `hints.handToUser` already reports exactly this —
 * lib/verticals/epoxy holds area to a HIGHER confidence floor than the other
 * fields precisely so that a shaky area guess is never presented as fact.
 *
 * ============================================================================
 * WHAT COSTS MONEY NOW — READ THIS, IT CHANGED
 * ============================================================================
 *
 * FREE, still, and still by construction: adjusting the area, changing finish,
 * the price recomputing, tilting, the gallery. calculateQuote runs in the
 * browser and there is no network path on any of those.
 *
 * COSTS MONEY: sending a photo now costs ONE VISION ANALYSIS immediately
 * (analyzePhotoAction), where before the upload cost nothing until the visitor
 * asked for a render. The render is a second, separate charge and is still
 * opt-in behind its own button.
 *
 * That is a real increase in cost per visitor and it is the deliberate trade of
 * this phase: analysis is the cheaper of the two calls, it is what makes the
 * card feel automatic, and both sit behind the same per-IP limit and daily
 * ceiling they always did. If spend becomes a problem, the lever is the ceiling
 * in lib/ai/budget.ts, not this component.
 *
 * ============================================================================
 * THE GALLERY
 * ============================================================================
 *
 * Where the pricer used to sit, the card now leads with recordings of the tool
 * working. A visitor who is not going to photograph his garage still sees what
 * the thing does — which is the whole reason this page exists — and the upload
 * sits above it in the space the pricer vacated.
 *
 * Below three filled slots MediaGallery renders nothing, so a tool with no
 * recordings gets a clean upload card rather than an empty frame.
 */

const MAX_TILT_DEG = 6;

export interface ToolCardFinish {
  id: string;
  label: string;
  tierKey: string;
  swatchHex?: string;
}

export interface ToolCardPricer {
  verticalId: string;
  surfaceTypeId: string;
  surfaceLabel: string;
  rules: PricingRules;
  finishes: ToolCardFinish[];
  sqftMin: number;
  sqftMax: number;
  defaultSqft: number;
  defaultTier: string;
  unitLabel?: string;
}

export interface ToolCardProps {
  toolId: string;
  trade: string;
  summary: string;
  unit: string;
  inService: boolean;
  tint: { a: string; b: string; durationSeconds: number };
  pricer: ToolCardPricer | null;
  quietReason?: string;
  renderEnabled: boolean;
  specHref: string;
  /** Recordings of the tool working. Fewer than three renders no gallery. */
  media: MediaSlot[];
}

type Flow =
  | { k: 'invite' }
  | { k: 'preparing'; stage: PipelineStage }
  | { k: 'analysing' }
  | { k: 'ready'; confident: boolean }
  | { k: 'failed'; message: string };

const STAGE_COPY: Record<PipelineStage, string> = {
  reading: 'Reading the file',
  decoding: 'Opening the photo',
  resizing: 'Preparing it',
  encoding: 'Compressing',
  done: 'Sending it over',
};

function money(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

export function ToolCard({
  toolId,
  trade,
  summary,
  unit,
  inService,
  tint,
  pricer,
  quietReason,
  renderEnabled,
  specHref,
  media,
}: ToolCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pressed, setPressed] = useState(false);

  const [flow, setFlow] = useState<Flow>({ k: 'invite' });
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [sqft, setSqft] = useState(pricer?.defaultSqft ?? 0);
  const [tierKey, setTierKey] = useState(pricer?.defaultTier ?? '');
  const [ruleOpen, setRuleOpen] = useState(false);

  const sessionId = useMemo(
    () => 'home-' + toolId + '-' + Math.random().toString(36).slice(2, 10),
    [toolId]
  );

  // Object URLs are revoked on unmount; this page is scrolled up and down while
  // somebody decides, and a leaked blob per attempt lives as long as the tab.
  const urls = useRef<string[]>([]);
  useEffect(() => {
    const held = urls.current;
    return () => {
      for (const u of held) URL.revokeObjectURL(u);
    };
  }, []);

  // ---- tilt: one rAF write per frame, on the card under the pointer only ----
  const raf = useRef(0);
  const target = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const commit = () => {
      raf.current = 0;
      el.style.setProperty('--tc-ry', (target.current.x * MAX_TILT_DEG).toFixed(3));
      el.style.setProperty('--tc-rx', (-target.current.y * MAX_TILT_DEG).toFixed(3));
    };
    const schedule = () => {
      if (!raf.current) raf.current = requestAnimationFrame(commit);
    };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.current = {
        x: (e.clientX - r.left) / r.width - 0.5,
        y: (e.clientY - r.top) / r.height - 0.5,
      };
      el.classList.add('tc-tilting');
      schedule();
    };
    const onLeave = () => {
      target.current = { x: 0, y: 0 };
      schedule();
      window.setTimeout(() => el.classList.remove('tc-tilting'), 260);
    };
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointercancel', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointercancel', onLeave);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  // ---- the one upload that drives everything --------------------------------
  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !pricer) return;

      setFlow({ k: 'preparing', stage: 'reading' });
      try {
        const { processImage } = await import('@/lib/image/pipeline');
        const prepared = await processImage(file, {
          onStage: (stage) => setFlow({ k: 'preparing', stage }),
        });
        if (!prepared.ok) {
          setFlow({ k: 'failed', message: prepared.message });
          return;
        }
        urls.current.push(prepared.previewUrl);
        setPhoto({
          base64: prepared.base64,
          mediaType: prepared.mediaType,
          previewUrl: prepared.previewUrl,
        });

        setFlow({ k: 'analysing' });
        const res = await analyzePhotoAction({
          mode: 'live',
          surface: 'public_hub',
          prototypeId: null,
          sessionId,
          vertical: pricer.verticalId,
          imageBase64: prepared.base64,
          mediaType: prepared.mediaType,
          surfaceTypeId: pricer.surfaceTypeId,
        });

        // An unavailable analysis is NOT a failure of the card. The visitor
        // still has a working pricer and a photo; he is simply asked for the
        // size instead of being told it. Lead capture and pricing never depend
        // on the model answering.
        const estimated = res.hints?.estimatedSqft;
        const areaUnsure = res.hints?.handToUser?.includes('estimated_area_sqft') ?? true;
        const confident = res.status === 'ok' && typeof estimated === 'number' && !areaUnsure;

        if (confident && typeof estimated === 'number') {
          setSqft(Math.min(pricer.sqftMax, Math.max(pricer.sqftMin, estimated)));
        }
        setRuleOpen(!confident);
        setFlow({ k: 'ready', confident });
      } catch {
        setFlow({
          k: 'failed',
          message: 'That photo could not be read. Try another one, or enter the size yourself.',
        });
      }
    },
    [pricer, sessionId]
  );

  const band = useMemo(() => {
    if (!pricer) return null;
    try {
      const q = calculateQuote(
        {
          sqft,
          surfaceTypeId: pricer.surfaceTypeId,
          finishTierKey: tierKey,
          conditionModifierIds: [],
          sqftMin: pricer.sqftMin,
          sqftMax: pricer.sqftMax,
        },
        pricer.rules
      );
      return { lowCents: q.lowCents, highCents: q.highCents };
    } catch {
      return null;
    }
  }, [pricer, sqft, tierKey]);

  const selectedFinish = pricer?.finishes.find((f) => f.tierKey === tierKey);
  const onDragState = useCallback((dragging: boolean) => setPressed(dragging), []);

  const style = {
    '--tc-1': tint.a,
    '--tc-2': tint.b,
    '--tc-dur': tint.durationSeconds + 's',
  } as CSSProperties;

  const showPanel = flow.k === 'ready' || flow.k === 'failed';

  return (
    <article
      ref={cardRef}
      className={'tc' + (pressed ? ' tc-press' : '') + (pricer ? '' : ' tc-quiet')}
      style={style}
    >
      <div aria-hidden className="tc-field" />
      <div aria-hidden className="tc-sheen" />

      <div className="tc-body">
        <header className="tc-head">
          <div>
            <h3 className="tc-trade">{trade}</h3>
            <p className="tc-sub">{summary}</p>
          </div>
          <span className="tc-status">
            <span aria-hidden className="tc-dot" />
            {inService ? 'In service' : 'On the queue'}
            <span className="tc-unit">· {unit}</span>
          </span>
        </header>

        {pricer ? (
          <>
            {/* ---- the invitation, now the first thing in the card ---- */}
            {flow.k !== 'ready' && (
              <div className="tc-up">
                <p className="tc-up-h">Send one photo of your garage</p>
                <p className="tc-up-sub">
                  It works out roughly how big the floor is and prices it. You do
                  not need to measure anything, and you do not need to tidy up.
                </p>

                <div className="tc-up-actions">
                  <button
                    type="button"
                    className="n15-btn n15-btn-primary"
                    disabled={flow.k === 'preparing' || flow.k === 'analysing'}
                    onClick={() => fileRef.current?.click()}
                  >
                    {flow.k === 'invite' || flow.k === 'failed'
                      ? 'Take or choose a photo'
                      : 'Working…'}
                  </button>
                </div>

                {flow.k === 'preparing' && (
                  <p className="tc-up-stage" aria-live="polite">
                    {STAGE_COPY[flow.stage]}
                  </p>
                )}
                {flow.k === 'analysing' && (
                  <p className="tc-up-stage" aria-live="polite">
                    Reading the photo and working out the size.
                  </p>
                )}
                {flow.k === 'failed' && (
                  <p className="tc-up-err" role="alert">
                    {flow.message}
                  </p>
                )}

                {flow.k === 'invite' && (
                  <p className="tc-up-note">
                    Nothing is recorded and you do not need an account.{' '}
                    <button
                      type="button"
                      className="tc-link"
                      onClick={() => {
                        setRuleOpen(true);
                        setFlow({ k: 'ready', confident: false });
                      }}
                    >
                      Or just enter the size yourself.
                    </button>
                  </p>
                )}
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="tc-file"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />

            {/* ---- recordings, where the pricer used to be ---- */}
            {flow.k === 'invite' && media.length > 0 && (
              <div className="tc-gallery">
                <MediaGallery slots={media} label={trade} />
              </div>
            )}

            {/* ---- the panel, revealed by the analysis ---- */}
            {showPanel && (
              <div className="tc-panel">
                <div className="tc-measure">
                  {flow.k === 'ready' && flow.confident ? (
                    <>
                      <p className="tc-measure-h">
                        Looks like about{' '}
                        <span className="tc-measure-n">{sqft.toLocaleString('en-US')}</span> sq ft.
                      </p>
                      {!ruleOpen && (
                        <button
                          type="button"
                          className="tc-link"
                          onClick={() => setRuleOpen(true)}
                        >
                          Not right? Adjust it.
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="tc-measure-h">
                      Roughly how big is the floor? An estimate is fine.
                    </p>
                  )}
                </div>

                {/* The rule is present but quiet — it opens when the model was
                    unsure, or when he asks. */}
                {ruleOpen && (
                  <div className="tc-rule">
                    <AreaRule
                      min={pricer.sqftMin}
                      max={pricer.sqftMax}
                      value={sqft}
                      step={10}
                      onChange={setSqft}
                      onDragStateChange={onDragState}
                      label="Area"
                      unitSuffix={pricer.unitLabel ?? 'sq ft'}
                    />
                  </div>
                )}

                <div className="tc-finishes">
                  {pricer.finishes.map((f) => {
                    const on = f.tierKey === tierKey;
                    const p = finishPhotoFor(pricer.verticalId, f.tierKey);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        className="tc-fin"
                        aria-pressed={on}
                        onClick={() => setTierKey(f.tierKey)}
                      >
                        <span
                          className="tc-fin-img"
                          style={{ '--fin-hex': f.swatchHex ?? '#2a2f37' } as CSSProperties}
                        >
                          {p ? (
                            <FinishThumb src={p.src} alt={p.alt} />
                          ) : (
                            <span aria-hidden className="tc-fin-ph" />
                          )}
                        </span>
                        <span className="tc-fin-name">{f.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="tc-price">
                  <p className="tc-price-label">Your range</p>
                  <div className="tc-band" aria-live="polite">
                    {band ? (
                      <>
                        <span className="tc-fig">{money(band.lowCents)}</span>
                        <span aria-hidden className="tc-dash" />
                        <span className="tc-fig">{money(band.highCents)}</span>
                      </>
                    ) : (
                      <span className="tc-fig">—</span>
                    )}
                  </div>
                  <p className="tc-free">
                    From this contractor&apos;s own published rates. Adjusting
                    anything here costs nothing.
                  </p>
                </div>

                {photo && (
                  <FinishVisualiser
                    enabled={renderEnabled}
                    photo={photo}
                    finishLabel={selectedFinish?.label ?? 'the finish'}
                    surfaceLabel={pricer.surfaceLabel}
                    sessionId={sessionId}
                  />
                )}
              </div>
            )}

            <div className="tc-actions">
              <Link href="/demo" className="n15-btn n15-btn-primary">
                Try it out
              </Link>
              <Link href={specHref} className="n15-btn n15-btn-ghost">
                More information
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="tc-reason">{quietReason}</p>
            <div className="tc-actions">
              <Link href={specHref} className="n15-btn n15-btn-ghost">
                More information
              </Link>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

/**
 * A finish photograph with its absence as a designed state. Every file under
 * /public/finishes is still missing, so this is the normal path, not the edge
 * case: a failed load swaps to the tinted swatch built from the finish's own
 * colour deck rather than painting a torn-page glyph inside a pricing control.
 *
 * Never `priority` — the LCP is the hero headline, and these sit below the fold.
 */
function FinishThumb({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span aria-hidden className="tc-fin-ph" />;
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="(min-width: 980px) 150px, 30vw"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
