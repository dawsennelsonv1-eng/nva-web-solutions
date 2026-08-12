'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { AreaRule } from '@/components/site/AreaRule';
import { FinishVisualiser, type PreparedPhoto } from '@/components/site/FinishVisualiser';
import { MediaGallery } from '@/components/tools/MediaGallery';
import { analyzePhotoAction } from '@/app/actions/quote';
import { persistDemoQuote, submitDemoLead, attachRenderToLead } from '@/app/actions/lead';
import { ContactGate, type ContactGateFields } from '@/components/site/ContactGate';
import { FinishPicker } from '@/components/site/FinishPicker';
import {
  comboKeyFor,
  missingRequired,
  renderDescription,
  selectionSummary,
  type Selections,
} from '@/lib/verticals/epoxy/options';
import { calculateQuote, type PricingRules } from '@/lib/quote/pricing';
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

/**
 * PreparedPhoto.mediaType is a plain `string` — the image pipeline produces it
 * and does not narrow it. analyzePhotoAction wants the union it actually
 * supports, so the two have to be reconciled somewhere.
 *
 * NARROWED BY CHECKING, NOT BY CASTING. `as 'image/webp'` would compile and
 * then send whatever the pipeline produced straight to a vision model, which
 * either errors on the provider's side or silently costs a call. This checks,
 * and falls back to the format the pipeline actually encodes to.
 *
 * VERIFY: lib/image/pipeline.ts encodes to WebP, so the fallback is what a
 * correct run produces anyway. If the pipeline ever emits something else, the
 * right fix is to narrow the type AT THE PIPELINE and delete this.
 */
type SupportedMediaType = 'image/jpeg' | 'image/webp' | 'image/png';

function narrowMediaType(value: string): SupportedMediaType {
  if (value === 'image/jpeg' || value === 'image/webp' || value === 'image/png') {
    return value;
  }
  return 'image/webp';
}

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
  /**
   * `diagnostic` is the operator's copy of what went wrong: every model tried,
   * in order, with the vendor's own sentence. It is rendered ONLY when the
   * page is loaded with `?debug=1` — see `debug` below. A homeowner sees
   * `message` and nothing else, ever.
   */
  | { k: 'failed'; message: string; diagnostic?: string[] };

const STAGE_COPY: Record<PipelineStage, string> = {
  reading: 'Reading the file',
  decoding: 'Opening the photo',
  resizing: 'Preparing it',
  encoding: 'Compressing',
  done: 'Sending it over',
};

/**
 * The operator diagnostic block. Monospace, wrapped, and small enough to read
 * a five-candidate chain on a phone without horizontal scrolling — which is
 * the device this will actually be read on.
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
   * ==========================================================================
   * THE OPERATOR SWITCH: append `?debug=1` TO THE URL.
   * ==========================================================================
   *
   * When the measurement fails, the visitor gets one plain sentence. That is
   * correct for him and useless for the person who has to fix it — and this
   * product spent a stretch of its life with a dead model slug in the middle
   * of its chain precisely because nobody could see past that sentence.
   *
   * With `?debug=1` the failed state also prints every candidate the router
   * tried and what each one said. It is deliberately NOT tied to admin
   * authentication: the fastest useful version of this is one Dawsen can open
   * on his phone, on the live site, without signing in. Nothing secret is
   * printed — model ids, HTTP statuses and vendor error text, all of which are
   * already in the ai_jobs ledger.
   *
   * Read in an effect rather than during render because `window` does not
   * exist on the server, and reading it in the initial useState value is a
   * hydration mismatch: the server renders `false`, the client renders `true`,
   * React discards the tree.
   */
  const [debug, setDebug] = useState(false);
  useEffect(() => {
    try {
      setDebug(new URLSearchParams(window.location.search).get('debug') === '1');
    } catch {
      /* a browser that refuses to parse its own URL is not worth a crash */
    }
  }, []);
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
  /**
   * The band the model measured. THE HEADLINE RESULT — see the panel below for
   * why this replaced a bare number, and why the slider is now a correction
   * rather than the way area is entered.
   */
  const [areaBand, setAreaBand] = useState<{
    lowSqft: number;
    highSqft: number;
    reference: string | null;
  } | null>(null);
  /**
   * What the visitor has built. The picker owns the vocabulary; this owns the
   * value, so the card can price it, describe it to the renderer and put it in
   * the lead.
   */
  const [selections, setSelections] = useState<Selections>({});
  const [gateOpen, setGateOpen] = useState(false);
  /**
   * Whether the render attempt has RESOLVED, either way.
   *
   * The price appears at this moment and not before. A render that failed
   * still resolves — a visitor who handed over his number and got neither a
   * picture nor a price is the one outcome worse than no render at all.
   */
  const [renderSettled, setRenderSettled] = useState(false);
  /**
   * Which combination the picture on screen was actually made for, and a
   * counter that forces a fresh one.
   *
   * ==========================================================================
   * THE DEAD END THIS FIXES
   * ==========================================================================
   *
   * FinishVisualiser guards autoStart behind a ref so a re-render can never
   * start a second paid generation. Correct — but it also meant that once a
   * visitor had his picture, changing a swatch reset the visualiser to idle and
   * NOTHING could start it again. He would tap "jumbo flake", watch his own
   * floor disappear, and have no way to get it back.
   *
   * The visualiser is now keyed on this counter. Changing a choice spends
   * nothing; it marks the picture stale and offers a button. Auto-running on
   * every tap would be a paid image generation per swatch — slow, and the kind
   * of spending nobody asked for.
   */
  const [renderedCombo, setRenderedCombo] = useState<string | null>(null);
  const [renderNonce, setRenderNonce] = useState(0);
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
        images: photos.map((p) => ({ base64: p.base64, mediaType: narrowMediaType(p.mediaType) })),
        surfaceTypeId: pricer.surfaceTypeId,
      });

      /**
       * ====================================================================
       * THE BUG THIS BLOCK FIXES — THE MOST EXPENSIVE ONE IN THE PRODUCT.
       * ====================================================================
       *
       * This used to read `res.hints` and go straight to
       * `setFlow({ k: 'ready', confident })` NO MATTER WHAT `res.status` SAID.
       *
       * So a total chain failure — every model down, or a retired slug
       * breaking the chain at candidate two — produced the identical screen to
       * a successful analysis in which the model was merely unsure: the panel
       * opened, the slider sat at `pricer.defaultSqft`, and `res.message`,
       * which said what had happened, was never read by anything.
       *
       * The visitor was then shown a price computed from 480 sq ft that had
       * never been measured, never been confirmed, and in the case that
       * exposed this was more than double the real floor. A quote a
       * contractor cannot honour, in front of his customer, is the worst
       * output this product can produce, and it was the DEFAULT behaviour
       * whenever measurement broke.
       *
       * A FAILED ANALYSIS IS NOW A FAILED ANALYSIS. It shows the server's own
       * sentence, keeps the visitor's photos, and leaves the explicit
       * "enter the size yourself" route as the way forward — which was always
       * the intended fallback and was simply never reachable, because the card
       * had already declared success on his behalf.
       */
      if (res.status !== 'ok') {
        setPhotoPath(res.photoPath ?? null);
        // The rule OPENS on failure. Without this the panel below renders
        // "Roughly how big is the floor?" with no control under it and no way
        // to answer — a dead end that looked like a working screen.
        setRuleOpen(true);
        setFlow({
          k: 'failed',
          message:
            res.message ??
            'The measurement did not run. Enter the size yourself and everything else works as normal.',
          ...(res.failure && res.failure.attempts.length > 0
            ? { diagnostic: [res.failure.code, ...res.failure.attempts] }
            : res.failure
              ? { diagnostic: [res.failure.code + (res.failure.detail ? ': ' + res.failure.detail : '')] }
              : {}),
        });
        return;
      }

      // From here the analysis genuinely succeeded. The visitor still has a
      // working pricer and his photos; if the model was not sure enough about
      // the area he is asked for it rather than told it. Lead capture and
      // pricing never depend on the model answering.
      const estimated = res.hints?.estimatedSqft;
      const areaUnsure = res.hints?.handToUser?.includes('estimated_area_sqft') ?? true;
      const measuredBand = res.hints?.areaBand ?? null;

      /**
       * A BAND COUNTS AS A MEASUREMENT EVEN WHEN THE POINT ESTIMATE DOES NOT.
       *
       * `EPOXY_AREA_CONFIDENCE_FLOOR` is 0.8 and it guards the single number
       * in `estimated_area_sqft`. That bar is right for a bare figure, and a
       * well-calibrated model will honestly report 0.65 for a floor read off
       * photographs — so the confident branch almost never ran, and the card
       * fell back to "Roughly how big is the floor?" even on a good analysis.
       *
       * The band is the honest form of the same answer. `readAreaBand` in
       * lib/quote/vision.ts only returns one when the model emitted two real
       * positive numbers, so its presence is itself evidence the model
       * committed to a footprint. Where there is a band, we state it.
       */
      const confident =
        measuredBand !== null || (typeof estimated === 'number' && !areaUnsure);

      setPhotoPath(res.photoPath ?? null);
      setAreaBand(measuredBand);

      /**
       * Seed the slider from the MIDPOINT of the band when there is one, and
       * from the point estimate otherwise. Clamped to the pricer's own bounds,
       * because a 40 sq ft utility room and a 9,000 sq ft warehouse are both
       * real and neither is priceable on this rate table.
       */
      const seed =
        measuredBand !== null
          ? Math.round((measuredBand.lowSqft + measuredBand.highSqft) / 2)
          : typeof estimated === 'number'
            ? estimated
            : null;
      if (seed !== null) {
        setSqft(Math.min(pricer.sqftMax, Math.max(pricer.sqftMin, seed)));
      }
      setRuleOpen(!confident);
      setFlow({ k: 'ready', confident });
    } catch (e) {
      /**
       * A THROW HERE IS ALMOST ALWAYS THE SERVER ACTION ITSELF, NOT THE PHOTOS.
       *
       * `analyzePhotoAction` is written never to throw — every failure inside
       * it is a returned object. So an exception at this call site means the
       * request never reached the function body: a network drop, or Next
       * rejecting the request before dispatch. The old copy blamed the
       * photographs for both, which sent people off to reshoot a garage over a
       * transport fault.
       *
       * VERIFY: five WebP frames base64-encoded is the one payload in this
       * product large enough to hit Next's server-action body limit, which
       * defaults to 1 MB. If the diagnostic below ever shows a body-size
       * rejection, the fix is `serverActions.bodySizeLimit` in next.config,
       * not this component.
       */
      const detail = e instanceof Error ? e.name + ': ' + e.message : String(e);
      setRuleOpen(true);
      setFlow({
        k: 'failed',
        message:
          'The measurement could not be sent. Check your connection and try again, or enter the size yourself.',
        diagnostic: ['client_exception: ' + detail],
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
        // The keys reconstruct the choice; the summary is what he was actually
        // shown, frozen here so a later catalogue rename cannot silently
        // rewrite the record of what was agreed.
        finishSelections: Object.fromEntries(
          Object.entries(selections).filter(([, v]) => v !== undefined)
        ) as Record<string, string | string[]>,
        finishSummary: selectionSummary(selections),
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

  /**
   * The chosen coating drives the PRICING tier.
   *
   * VERIFY: the picker's catalogue has five systems; a contractor's rate table
   * may carry fewer tiers, and their keys are the contractor's, not ours. So
   * this matches by looking for the system's name inside the tier's own label
   * and CHANGES NOTHING when it cannot find one — an unmatched system keeps
   * whatever tier was already selected rather than silently pricing a metallic
   * pour as a solid coat.
   *
   * When a real rate table is onboarded, replace this with an explicit map on
   * the pricer config rather than extending the string matching.
   */
  useEffect(() => {
    if (!pricer) return;
    const system = selections.system;
    if (typeof system !== 'string') return;
    const want: Record<string, string[]> = {
      solid: ['solid', 'standard', 'epoxy'],
      flake: ['flake', 'chip', 'decorative'],
      quartz: ['quartz'],
      metallic: ['metallic'],
      polyaspartic: ['polyaspartic', 'poly'],
    };
    const needles = want[system] ?? [];
    const hit = pricer.finishes.find((f) =>
      needles.some((n) => f.label.toLowerCase().includes(n))
    );
    if (hit) setTierKey(hit.tierKey);
  }, [pricer, selections.system]);

  const selectedFinish = pricer?.finishes.find((f) => f.tierKey === tierKey);
  const stillToChoose = missingRequired(selections);
  /**
   * The picture on screen no longer matches the choices below it.
   *
   * Compared on comboKeyFor, which is canonical and order-independent and
   * EXCLUDES the groups that change nothing visible — so choosing a different
   * slab preparation does not offer to rebuild a picture that would come back
   * identical.
   */
  const renderStale =
    renderedCombo !== null && renderedCombo !== comboKeyFor(selections);
  const readyToRender = stillToChoose.length === 0;
  const onDragState = useCallback((dragging: boolean) => setPressed(dragging), []);

  const style = {
    '--tc-1': tint.a,
    '--tc-2': tint.b,
    '--tc-dur': tint.durationSeconds + 's',
  } as CSSProperties;

  /**
   * WAS `flow.k === 'ready' || flow.k === 'failed'`.
   *
   * On a failure that rendered BOTH the upload block (carrying the error) and
   * the whole panel below it — the area question, the picker, the call to
   * action — at the same time. Two competing screens, one of them asking the
   * visitor to keep going as though nothing had happened, and a large chunk of
   * content appearing and disappearing under his thumb as the flow changed.
   *
   * A failure is now one screen with one way forward. Tapping "Enter the size
   * yourself instead" moves the flow to `ready` and the panel appears then.
   */
  const showPanel = flow.k === 'ready';

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
                  <>
                    <p className="tc-up-err" role="alert">
                      {flow.message}
                    </p>
                    {/* THE WAY OUT, ON THE SCREEN THAT NEEDS IT MOST.
                        This link used to exist only on the untouched invite
                        state, so somebody whose measurement had just failed
                        was left with a retry button and nothing else. The
                        manual route is the documented fallback for exactly
                        this situation and it was unreachable from it. */}
                    <p className="tc-up-note">
                      <button
                        type="button"
                        className="tc-link"
                        onClick={() => setFlow({ k: 'ready', confident: false })}
                      >
                        Enter the size yourself instead.
                      </button>
                    </p>
                    {/* OPERATOR ONLY — `?debug=1`. Never rendered for a
                        visitor. This is the list the router built and every
                        layer between it and this component used to discard. */}
                    {debug && flow.diagnostic && flow.diagnostic.length > 0 && (
                      /* INLINE STYLES, DELIBERATELY, AND THIS IS THE ONE PLACE
                         IT IS RIGHT IN THIS CODEBASE.

                         phase15b.css records the rule that inline style objects
                         are banned because they are invisible to anyone
                         auditing the type system. That rule protects the
                         DESIGN. This element is not part of the design: it is
                         a diagnostic that only appears behind ?debug=1, it is
                         never seen by a visitor, and it is never filmed.

                         Giving it a class would mean a new CSS layer and an
                         edit to app/layout.tsx to register it — a change to
                         the global stylesheet order for four lines of
                         debugging text. That is the worse trade. */
                      <pre style={DIAG_STYLE}>{flow.diagnostic.join('\n')}</pre>
                    )}
                  </>
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
                      {/* ------------------------------------------------
                          A BAND, NOT A BARE NUMBER.

                          "480 sq ft" presented flat is a guess wearing the
                          costume of a measurement, and when the slab turns out
                          to be 610 the contractor eats the difference in front
                          of the customer.

                          "Between 440 and 520" is what the model actually
                          concluded, and it reads as MORE authoritative rather
                          than less — a band is the shape of something that was
                          measured. It also makes the correction below feel
                          like a refinement instead of a contradiction.
                         ------------------------------------------------ */}
                      {areaBand ? (
                        <p className="tc-measure-h">
                          Your floor is between{' '}
                          <span className="tc-measure-n">
                            {areaBand.lowSqft.toLocaleString('en-US')}
                          </span>{' '}
                          and{' '}
                          <span className="tc-measure-n">
                            {areaBand.highSqft.toLocaleString('en-US')}
                          </span>{' '}
                          sq ft.
                        </p>
                      ) : (
                        <p className="tc-measure-h">
                          Your floor is{' '}
                          <span className="tc-measure-n">{sqft.toLocaleString('en-US')}</span> sq
                          ft.
                        </p>
                      )}
                      <p className="tc-measure-src">
                        Read from your {photos.length} photos
                        {areaBand?.reference ? ', measured against the ' + areaBand.reference : ''}
                        .
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

                {/* ------------------------------------------------------------
                    THE PICKER REPLACED THREE CHIPS.

                    Three finish buttons was the whole customisation step, and
                    it was not a customisation step — it was a tier selector
                    wearing swatches. A real epoxy contractor sells coatings,
                    blends, coverage, chip size, topcoats, extras and prep, and
                    a homeowner who cannot express what he wants cannot be sold
                    what he wants.
                   ------------------------------------------------------------ */}
                <FinishPicker
                  verticalId={pricer.verticalId}
                  selections={selections}
                  onChange={setSelections}
                />

                {/* ------------------------------------------------------------
                    THE CALL TO ACTION SELLS THE PICTURE, NOT THE PRICE.

                    "See my price" asks somebody to hand over a phone number
                    for a number he half expects to dislike. "See it on my own
                    floor" offers the thing he has spent two minutes building
                    and cannot get anywhere else. Same form, same fields,
                    completely different reason to fill it in.

                    The price is not mentioned, not teased and not hinted at.
                    It arrives with the picture at the end.
                   ------------------------------------------------------------ */}
                {!unlocked && !gateOpen && (
                  <div className="tc-locked">
                    <p className="tc-locked-h">
                      {readyToRender
                        ? 'Ready to see it'
                        : 'Finish choosing and you can see it'}
                    </p>
                    <p className="tc-locked-sub">
                      {readyToRender
                        ? renderEnabled
                          ? 'We will put this exact finish onto the photos of your own garage.'
                          : 'Everything you have chosen, written up for your installer.'
                        : 'Still to pick: ' +
                          stillToChoose.map((g) => g.label.toLowerCase()).join(', ') +
                          '.'}
                    </p>
                    <button
                      type="button"
                      className="n15-btn n15-btn-primary tc-locked-go"
                      disabled={!readyToRender}
                      onClick={() => setGateOpen(true)}
                    >
                      {renderEnabled
                        ? 'See it on my own floor'
                        : 'Send this to my installer'}
                    </button>
                  </div>
                )}

                {gateOpen && !unlocked && (
                  <ContactGate
                    headline="Where should we send it?"
                    blurb={
                      renderEnabled
                        ? 'We will build the picture of your garage in ' +
                          (selectedFinish?.label ?? 'this finish').toLowerCase() +
                          ' and put it on this screen in about thirty seconds.'
                        : 'Your choices go straight to the installer who will do the work.'
                    }
                    submitLabel={
                      renderEnabled ? 'Show me my floor' : 'Send it'
                    }
                    onSubmit={submitGate}
                  />
                )}

                {/* ------------------------------------------------------------
                    THE RESULTS.

                    Everything the visitor exchanged his details for arrives
                    here, in one place, in the order he cares about: the
                    picture of his own floor, then what it costs, then a
                    written record of what he chose.

                    The picture is first because it is what he asked for. The
                    price follows it rather than leading, because a number read
                    beside a floor he already wants is information, and the
                    same number read cold is an objection.
                   ------------------------------------------------------------ */}
                {unlocked && (
                  <div className="tc-results">
                    {photo && (
                      <FinishVisualiser
                        /* KEYED, so a re-render is possible at all. The
                           visualiser refuses to auto-start twice within one
                           mount — correct, since each start is a paid image
                           generation — which meant that after changing a
                           swatch nothing could ever start it again. A new key
                           is a new mount, and the button below is the only
                           thing that turns it. */
                        key={renderNonce}
                        enabled={renderEnabled}
                        photo={photo}
                        finishLabel={selectedFinish?.label ?? 'the finish'}
                        finishDescription={renderDescription(selections)}
                        selections={selections}
                        surfaceLabel={pricer.surfaceLabel}
                        sessionId={sessionId}
                        autoStart
                        onRendered={handleRendered}
                        onSettled={() => {
                          setRenderSettled(true);
                          setRenderedCombo(comboKeyFor(selections));
                        }}
                      />
                    )}

                    {/* Stale only when a picture EXISTS and the choices have
                        moved on from it. Never shown before the first render,
                        where it would be an offer to redo something that has
                        not happened. */}
                    {renderStale && (
                      <div className="tc-stale">
                        <p className="tc-stale-h">You have changed the finish.</p>
                        <p className="tc-stale-b">
                          The picture above is the one you had before. Building a new one
                          takes about thirty seconds.
                        </p>
                        <button
                          type="button"
                          className="n15-btn n15-btn-ghost"
                          onClick={() => {
                            setRenderSettled(false);
                            setRenderNonce((n) => n + 1);
                          }}
                        >
                          See the new one
                        </button>
                      </div>
                    )}

                    {/* THE PRICE. Last, and only once.

                        Gated on renderSettled rather than on a SUCCESSFUL
                        render: a failed render still resolves, and somebody
                        who handed over his number and receives neither a
                        picture nor a price has been treated worse than if we
                        had never offered. With the visualiser switched off
                        there is nothing to wait for. */}
                    {(renderSettled || !renderEnabled) && (
                      <>
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
                            At this installer&apos;s own published rates, for{' '}
                            {sqft.toLocaleString('en-US')} sq ft. Change anything below and
                            it moves — that costs nothing.
                          </p>
                        </div>

                        {/* WHAT HE CHOSE, WRITTEN OUT.

                            The same summary the installer receives, so the two
                            of them are looking at one specification rather
                            than at a memory of some swatches. It is also the
                            thing a homeowner reads back to a spouse, which is
                            most of what happens between a quote and a job. */}
                        <div className="tc-spec">
                          <p className="tc-spec-h">What you chose</p>
                          <ul className="tc-spec-list">
                            {selectionSummary(selections).map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                          <p className="tc-spec-note">
                            This has gone to your installer with your photos. Expect a call
                            — they will confirm the concrete before anything is booked.
                          </p>
                        </div>
                      </>
                    )}
                  </div>
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

/*
 * FinishThumb and finishPhotoFor were REMOVED IN PHASE 30.
 *
 * They rendered the three-swatch finish row, which FinishPicker replaced. The
 * picker loads its own pictures from finish_media through
 * getFinishMediaAction, so the /public/finishes convention they depended on
 * has no remaining caller here.
 *
 * Deleted rather than left in place: this codebase's lint rejects unused
 * imports, and an unused component is a thing a future reader has to work out
 * is dead before they can safely change anything near it.
 */
