'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AreaRule } from '@/components/site/AreaRule';
import { FinishVisualiser, type PreparedPhoto } from '@/components/site/FinishVisualiser';
import { MediaGallery } from '@/components/tools/MediaGallery';
import { analyzePhotoAction } from '@/app/actions/quote';
import { persistDemoQuote, submitDemoLead, attachRenderToLead } from '@/app/actions/lead';
import { ContactGate, type ContactGateFields } from '@/components/site/ContactGate';
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

/**
 * ============================================================================
 * HOW MANY PHOTOGRAPHS, AND WHY THESE TWO NUMBERS
 * ============================================================================
 *
 * MINIMUM THREE. One frame of a garage carries almost no scale information —
 * the model infers area from whatever happens to be in shot and is wrong often
 * enough to be dangerous, because the failure mode is a CONFIDENT number that
 * is badly off. That becomes a quote a contractor cannot honour, and a wrong
 * price in front of a homeowner is the most expensive failure this product
 * has. Three frames from different corners give parallax, more than one
 * known-size object, and usually the full run of at least one wall.
 *
 * MAXIMUM FIVE. Past five the marginal frame adds nothing a corner shot has
 * not already established, while every frame is input tokens on a call the
 * visitor is waiting through. Five is also about the limit of what somebody
 * will actually do standing in their garage before they give up.
 *
 * The floor is enforced, the ceiling is enforced, and the visitor is told
 * both before he starts rather than discovering them by being refused.
 */
const MIN_PHOTOS = 3;
const MAX_PHOTOS = 5;

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
  /**
   * Where "Implement this in my business" goes — the intake questionnaire that
   * captures a contractor's contact details.
   *
   * OPTIONAL WITH A DEFAULT, on purpose. Every mount of this card would
   * otherwise have to be found and updated in the same commit, and ToolDeck on
   * the homepage is one of them. A required prop here breaks that build for a
   * value every call site would compute identically anyway. Pass it to
   * override; leave it off and the card points at the questionnaire for its
   * own tool.
   */
  intakeHref?: string;
  /** Recordings of the tool working. Fewer than three renders no gallery. */
  media: MediaSlot[];
}

/** VERIFY: repoint if the questionnaire ever moves off /start. */
function defaultIntakeHref(toolId: string): string {
  return '/start?tool=' + encodeURIComponent(toolId);
}

/**
 * `collecting` is the state this phase adds, and it is the important one.
 *
 * Before, a chosen file went straight to the model. Now the visitor gathers
 * frames, SEES what he has gathered, and confirms. That review step is not
 * decoration: a blurred shot or a photograph of the wrong room is obvious to a
 * person in a thumbnail grid and invisible to a model, which will happily
 * measure whatever it was handed and report a confident number for it. The
 * cheapest place to catch a bad frame is before it is paid for.
 */
type Flow =
  | { k: 'invite' }
  | { k: 'preparing'; stage: PipelineStage }
  | { k: 'collecting' }
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
  intakeHref,
  media,
}: ToolCardProps) {
  const intake = intakeHref ?? defaultIntakeHref(toolId);
  const cardRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pressed, setPressed] = useState(false);

  const [flow, setFlow] = useState<Flow>({ k: 'invite' });
  /**
   * Every prepared frame, in the order they were chosen. The FIRST one is what
   * the finish visualiser renders, because that is the shot the visitor took
   * first and it is almost always the establishing view of the whole floor.
   */
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const photo = photos[0] ?? null;
  /**
   * THE GATE.
   *
   * null            — the price is a locked plate and there is no render
   * { open: true }  — the form is showing
   * { leadId }      — details given; price visible, render running
   *
   * Once unlocked it never re-locks. Taking a price back off somebody who
   * already gave you his phone number would be the single most hostile thing
   * this card could do.
   */
  /** Storage path of the first uploaded photo, carried onto the quote row. */
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [unlocked, setUnlocked] = useState<{ leadId: string } | null>(null);
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

  // ---- gathering frames ----------------------------------------------------

  /**
   * Prepares chosen files and adds them to the set. Does NOT analyse — that is
   * the visitor's decision, taken on the review grid once he can see what he
   * has.
   *
   * Files are processed one at a time rather than in parallel. processImage
   * decodes and re-encodes on the main thread; five at once on a mid-range
   * Android locks the tab for long enough to look crashed, and the stage
   * readout would be meaningless because five of them would be racing to write
   * it.
   */
  const handleFiles = useCallback(
    async (chosen: FileList | null) => {
      if (!chosen || chosen.length === 0 || !pricer) return;

      const room = MAX_PHOTOS - photos.length;
      if (room <= 0) return;
      const files = Array.from(chosen).slice(0, room);

      setFlow({ k: 'preparing', stage: 'reading' });
      const prepared: PreparedPhoto[] = [];

      try {
        const { processImage } = await import('@/lib/image/pipeline');
        for (const file of files) {
          const out = await processImage(file, {
            onStage: (stage) => setFlow({ k: 'preparing', stage }),
          });
          if (!out.ok) {
            // One bad file does not discard the good ones already prepared.
            // Losing four accepted photos because the fifth was a screenshot
            // is the kind of thing that makes somebody close the tab.
            setPhotos((p) => [...p, ...prepared].slice(0, MAX_PHOTOS));
            setFlow({ k: 'failed', message: out.message });
            return;
          }
          urls.current.push(out.previewUrl);
          prepared.push({
            base64: out.base64,
            mediaType: out.mediaType,
            previewUrl: out.previewUrl,
          });
        }

        setPhotos((p) => [...p, ...prepared].slice(0, MAX_PHOTOS));
        setFlow({ k: 'collecting' });
      } catch {
        setPhotos((p) => [...p, ...prepared].slice(0, MAX_PHOTOS));
        setFlow({
          k: 'failed',
          message: 'Those photos could not be read. Try again, or enter the size yourself.',
        });
      }
    },
    [pricer, photos.length]
  );

  const removePhoto = useCallback((i: number) => {
    setPhotos((p) => p.filter((_, n) => n !== i));
  }, []);

  // ---- the one call, made when he confirms ---------------------------------

  /**
   * ONE call carrying every frame. Not one call per frame: five analyses would
   * cost five times as much, meter five times against the contractor's cap,
   * and return five independent guesses that nothing can honestly reconcile.
   * One call reasons across all five, which is the whole reason for asking for
   * five.
   */
  const analyse = useCallback(async () => {
    if (!pricer || photos.length < MIN_PHOTOS) return;

    setFlow({ k: 'analysing' });
    try {
      const res = await analyzePhotoAction({
        mode: 'live',
        surface: 'public_hub',
        prototypeId: null,
        sessionId,
        vertical: pricer.verticalId,
        images: photos.map((p) => ({ base64: p.base64, mediaType: p.mediaType as "image/jpeg" | "image/webp" | "image/png" })),
        surfaceTypeId: pricer.surfaceTypeId,
      });

      // An unavailable analysis is NOT a failure of the card. The visitor
      // still has a working pricer and his photos; he is simply asked for the
      // size instead of being told it. Lead capture and pricing never depend
      // on the model answering.
      const estimated = res.hints?.estimatedSqft;
      const areaUnsure = res.hints?.handToUser?.includes('estimated_area_sqft') ?? true;
      const confident = res.status === 'ok' && typeof estimated === 'number' && !areaUnsure;

      setPhotoPath(res.photoPath ?? null);

      if (confident && typeof estimated === 'number') {
        setSqft(Math.min(pricer.sqftMax, Math.max(pricer.sqftMin, estimated)));
      }
      setRuleOpen(!confident);
      setFlow({ k: 'ready', confident });
    } catch {
      setFlow({
        k: 'failed',
        message: 'Those photos could not be read. Try others, or enter the size yourself.',
      });
    }
  }, [pricer, photos, sessionId]);

  /**
   * The WHOLE computation is kept now, not just the two figures. The gate has
   * to persist a quote row so the contractor's email carries a price, and
   * persistDemoQuote takes the computation and recomputes it server-side from
   * the stored rules — the client's cents are never written, which is the same
   * rule the real product's persistQuoteAction enforces.
   */
  const computation = useMemo(() => {
    if (!pricer) return null;
    try {
      return calculateQuote(
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
    } catch {
      return null;
    }
  }, [pricer, sqft, tierKey]);

  const band = computation
    ? { lowCents: computation.lowCents, highCents: computation.highCents }
    : null;

  /**
   * The gate's server work, in the only order it can run in.
   *
   *   1. persist the quote  — so the lead can point at a real price
   *   2. write the lead     — THE ONE STEP THAT MAY NOT FAIL SILENTLY
   *   3. unlock             — price visible, render starts on mount
   *
   * Step 1 is allowed to fail. A missing quote id costs a line in the
   * contractor's email; it must never cost the lead, which is the thing the
   * visitor actually handed over his details for. Step 2 failing is the only
   * outcome that returns a message and keeps the form on screen.
   *
   * VERIFY: persistDemoQuote recomputes against DEMO_RULES rather than against
   * this card's own pricer.rules. On the homepage and the tool pages those are
   * the same constants today, so the stored figures match what the visitor is
   * shown. If a card is ever configured with different rules, the quote row
   * would disagree with the screen — at which point persistDemoQuote needs a
   * rules argument rather than this comment.
   */
  const submitGate = useCallback(
    async (fields: ContactGateFields): Promise<string | null> => {
      if (!pricer) return 'Something is misconfigured here. Try reloading.';

      let quotePublicId: string | null = null;
      if (computation) {
        try {
          quotePublicId = await persistDemoQuote(computation, {
            surface: 'public_hub',
            sessionId,
            usedAiAnalysis: photos.length > 0,
            photoPath,
          });
        } catch {
          quotePublicId = null;
        }
      }

      const res = await submitDemoLead({
        surface: 'public_hub',
        sessionId,
        name: fields.name,
        phone: fields.phone,
        email: fields.email,
        timeline: fields.timeline,
        wasDegraded: false,
        degradedReason: null,
        quotePublicId,
        renderPath: null,
      });

      if (!res.ok) return res.error;

      setUnlocked({ leadId: res.payload.leadId });
      setGateOpen(false);
      return null;
    },
    [pricer, computation, sessionId, photos.length, photoPath]
  );

  /**
   * The render lands after the lead is already written, so the picture is
   * attached in a second call. Fire-and-forget: the visitor is looking at his
   * floor by now and nothing on screen depends on this.
   */
  const handleRendered = useCallback(
    (storagePath: string | null) => {
      if (!storagePath || !unlocked) return;
      void attachRenderToLead({ leadId: unlocked.leadId, renderPath: storagePath }).catch(
        () => {}
      );
    },
    [unlocked]
  );

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
            {/* ------------------------------------------------------------
                RECORDINGS FIRST — PHASE 26.

                They used to sit under the upload invitation. Above it is the
                right order for one reason: a visitor who has not yet decided
                to photograph his garage has been asked to do something before
                being shown why. Seeing the tool work is the argument for
                opening the camera, so it goes first.

                It still disappears the moment a photo is in flight. The
                carousel is the pitch; once he is inside the flow it is noise,
                and the card collapsing upward puts the result where his eye
                already is.
               ------------------------------------------------------------ */}
            {flow.k === 'invite' && media.length > 0 && (
              <div className="tc-gallery tc-gallery-lead">
                <MediaGallery slots={media} label={trade} />
              </div>
            )}

            {/* ---- the invitation. Hidden once he is reviewing what he has:
                   the grid carries its own "Add another". ---- */}
            {flow.k !== 'ready' && flow.k !== 'collecting' && (
              <div className="tc-up">
                <p className="tc-up-h">
                  Send {MIN_PHOTOS} to {MAX_PHOTOS} photos of your garage
                </p>
                <p className="tc-up-sub">
                  One from each corner. It works out how big the floor is and prices
                  it — you do not need to measure anything, and you do not need to
                  tidy up. Get the garage door or a car in at least one shot; that is
                  what it measures against.
                </p>

                <div className="tc-up-actions">
                  <button
                    type="button"
                    className="n15-btn n15-btn-primary"
                    disabled={flow.k === 'preparing' || flow.k === 'analysing'}
                    onClick={() => fileRef.current?.click()}
                  >
                    {flow.k === 'invite' || flow.k === 'failed'
                      ? 'Take or choose photos'
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
                    Measuring the floor across all {photos.length} photos.
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

            {/*
              NO `capture` ATTRIBUTE. THIS IS THE FIX, NOT AN OMISSION.

              `capture="environment"` does not mean "prefer the camera" — on
              Android Chrome it means "the camera, and only the camera". The
              chooser never opens, so there is no route to the camera roll and
              no way to send a photo taken five minutes ago. Every visitor was
              being forced to stand in his garage to use the tool.

              Without it the browser offers camera AND gallery AND files, with
              the camera still one tap away. Strictly more capable, and the
              only reason to put it back is if the tool must never accept a
              photo of somebody else's floor — which it must, because that is
              how a contractor demonstrates it from his truck.
            */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="tc-file"
              onChange={(e) => {
                void handleFiles(e.target.files);
                // Cleared so choosing the SAME file again still fires onChange.
                // Without this, a retry after a rejected photo does nothing and
                // reads as a dead button.
                e.target.value = '';
              }}
            />

            {/* ------------------------------------------------------------
                THE REVIEW GRID.

                He sees what he gathered before anything is spent on it. A
                blurred frame or a photograph of the wrong room is obvious to a
                person here and invisible to a model, which will measure
                whatever it was handed and report a confident number for it.

                The confirm button is disabled below MIN_PHOTOS and SAYS how
                many more are needed. A disabled button with no explanation is
                the most common way a form dead-ends somebody.
               ------------------------------------------------------------ */}
            {flow.k === 'collecting' && photos.length > 0 && (
              <div className="tc-review">
                <p className="tc-review-h">
                  {photos.length} of {MAX_PHOTOS} photos
                </p>

                <ul className="tc-picks">
                  {photos.map((p, i) => (
                    <li key={p.previewUrl} className="tc-pick">
                      {/* A plain img: these are blob: URLs from the browser's
                          own pipeline, and next/image cannot optimise those. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.previewUrl} alt={'Photo ' + (i + 1) + ' of your floor'} />
                      <button
                        type="button"
                        className="tc-pick-x"
                        onClick={() => removePhoto(i)}
                        aria-label={'Remove photo ' + (i + 1)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>

                <p className="tc-review-note">
                  {photos.length < MIN_PHOTOS
                    ? `${MIN_PHOTOS - photos.length} more and it can measure the floor. Different corners work best.`
                    : 'Check they all show the same floor and none are blurred.'}
                </p>

                <div className="tc-review-actions">
                  <button
                    type="button"
                    className="n15-btn n15-btn-primary"
                    disabled={photos.length < MIN_PHOTOS}
                    onClick={() => void analyse()}
                  >
                    {photos.length < MIN_PHOTOS
                      ? `Add ${MIN_PHOTOS - photos.length} more`
                      : `Measure my floor`}
                  </button>
                  <button
                    type="button"
                    className="n15-btn n15-btn-ghost"
                    disabled={photos.length >= MAX_PHOTOS}
                    onClick={() => fileRef.current?.click()}
                  >
                    Add another
                  </button>
                </div>
              </div>
            )}

            {/* ---- the panel, revealed by the analysis ---- */}
            {showPanel && (
              <div className="tc-panel">
                <div className="tc-measure">
                  {flow.k === 'ready' && flow.confident ? (
                    <>
                      {/* AUTHORITATIVE, BUT ONLY WHEN IT HAS EARNED IT.
                          This branch is reached solely when the module's own
                          confidence floor for area was cleared — 0.8, higher
                          than every other field, because area scales the whole
                          quote linearly. Below that bar the other branch runs
                          and asks instead of telling. So the flat statement
                          here is not bravado; it is what the model actually
                          concluded, and the "adjust it" link keeps the
                          homeowner the final authority on his own garage. */}
                      <p className="tc-measure-h">
                        Your floor is{' '}
                        <span className="tc-measure-n">{sqft.toLocaleString('en-US')}</span> sq ft.
                      </p>
                      <p className="tc-measure-src">
                        Measured from your {photos.length} photos.
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

                {/* ------------------------------------------------------------
                    THE PRICE, AND WHAT STANDS IN FRONT OF IT.

                    Locked, the plate does NOT show a blurred number or a
                    partial one. A blurred price is a dark pattern wearing a
                    costume: it implies a figure exists and is being withheld
                    to extract something, and a visitor who squints at it and
                    guesses wrong has been misled by the software. It says
                    plainly that the number is calculated and where it goes.

                    Unlocked, it is the same band it always was, from the same
                    published rates, with the same free-to-adjust line. Nothing
                    about the arithmetic changed — only when it is shown.
                   ------------------------------------------------------------ */}
                {unlocked ? (
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
                ) : gateOpen ? (
                  <ContactGate
                    headline="Where should we send it?"
                    blurb={
                      renderEnabled
                        ? 'Your price range, and a picture of your own floor in ' +
                          (selectedFinish?.label ?? 'this finish').toLowerCase() +
                          '. Both on this screen in about thirty seconds.'
                        : 'Your price range, on this screen as soon as you send this.'
                    }
                    submitLabel="Show me my price"
                    onSubmit={submitGate}
                  />
                ) : (
                  <div className="tc-locked">
                    <p className="tc-locked-h">Your range is ready</p>
                    <p className="tc-locked-sub">
                      Worked out from {sqft.toLocaleString('en-US')} sq ft in{' '}
                      {(selectedFinish?.label ?? 'the finish').toLowerCase()}, at this
                      installer&apos;s own published rates.
                      {renderEnabled
                        ? ' Say where to send it and you will also see it on your own floor.'
                        : ''}
                    </p>
                    <button
                      type="button"
                      className="n15-btn n15-btn-primary tc-locked-go"
                      onClick={() => setGateOpen(true)}
                    >
                      {renderEnabled ? 'See my price and my floor' : 'See my price'}
                    </button>
                  </div>
                )}

                {/* The render only exists on the far side of the gate. It is
                    the expensive call in this whole funnel — ten to forty
                    times a vision analysis — and an anonymous visitor must
                    never be able to start one. autoStart because he has
                    already asked for it by handing over his number; another
                    button here would be a step between him and the thing he
                    just paid for with his details. */}
                {photo && unlocked && (
                  <FinishVisualiser
                    enabled={renderEnabled}
                    photo={photo}
                    finishLabel={selectedFinish?.label ?? 'the finish'}
                    surfaceLabel={pricer.surfaceLabel}
                    sessionId={sessionId}
                    autoStart
                    onRendered={handleRendered}
                  />
                )}
              </div>
            )}

            <div className="tc-actions tc-actions-stack">
              {/* The tool's own page, not /demo. That page now carries the
                  working tool AND how it is used; /demo is the directory of
                  every tool. Sending "Try it out" to a directory made the
                  visitor pick his trade a second time. */}
              <Link href={specHref} className="n15-btn n15-btn-primary">
                Try it out
              </Link>
              {/* ------------------------------------------------------------
                  WAS "More information", POINTED AT specHref — THE SAME PLACE
                  AS THE BUTTON BESIDE IT.

                  On a tool page that made both buttons no-ops: specHref is
                  that page's own URL, so the card offered two ways to stay
                  exactly where you were. The second action now does the only
                  thing the card has no other way to do — hand a contractor to
                  the form that takes his details.

                  The label names the outcome rather than the destination.
                  "More information" describes what the visitor receives;
                  "Implement this in my business" describes what he gets done.
                 ------------------------------------------------------------ */}
              <Link href={intake} className="n15-btn n15-btn-ghost">
                Implement this in my business
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

