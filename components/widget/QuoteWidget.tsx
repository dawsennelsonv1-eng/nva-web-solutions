'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MotionProvider } from '@/lib/motion';
import { calculateQuote, type QuoteComputation } from '@/lib/quote/pricing';
import type { VisionField } from '@/lib/quote/vision';
import { track } from '@/lib/analytics.client';
import type { DbDegradedReason, Surface, WidgetMode } from '@/types';
import { QuoteMachineProvider, useQuoteMachine, useQuoteStore } from './store';
import { StepSurface, type SurfaceOption } from './StepSurface';
import { StepFinish, type FinishOptionView } from './StepFinish';
import { StepArea } from './StepArea';
import { StepCapture, type CaptureFields } from './StepCapture';
import { DegradedFlow } from './DegradedFlow';
import { StyleToggle } from './StyleToggle';

/**
 * components/widget/QuoteWidget.tsx — the root.
 *
 * === PHASE 5 CORRECTION, disclosed plainly ===
 * As shipped in Phase 4, this file accepted `analyze`, `persistQuote` and
 * `submitLead` on its `ports` prop but only ever threaded `touchSession`
 * into the machine it creates. The other three were silently dropped: the
 * widget rendered, every step worked, and nothing about it *looked* broken —
 * but no photo analysis ever ran, no quote was ever persisted, and no lead
 * was ever written to the database, because the machine's own copy of
 * `ports` (set once, at creation, in `QuoteMachineProvider`) never received
 * them. Nothing in a typecheck or a route-level build catches an unused
 * prop. It surfaced now because Phase 5 is the first phase that calls the
 * widget with real ports and expects a real lead at the other end.
 * lib/quote/machine.test.ts is new specifically to make this class of gap a
 * test failure next time, not a silent no-op.
 *
 * The `analyze` port's shape also changes here to match what
 * lib/quote/machine.ts's `attachPhoto` actually consumes — Phase 4's
 * declared shape (a `status` field, optional hint fields) never matched the
 * machine's contract (a plain hints object or null) and could not have
 * worked as typed. The adapter that calls the real server action now lives
 * where it's mounted (components/demo/DemoExperience.tsx) and throws
 * `AnalysisDegradedSignal` for the one case a plain return value can't
 * express: entitlement changing mid-flow.
 *
 * MODE IS STILL A REQUIRED PROP with no default and no route inference
 * (R-123) — that part of Phase 4 was correct and is unchanged.
 */

export interface WidgetConfig {
  vertical: string;
  step1Question: string;
  surfaceTypes: SurfaceOption[];
  finishes: FinishOptionView[];
  rules: unknown;
  sqftMin: number;
  sqftMax: number;
  conditionModifiers: { id: string; label: string }[];
  contractorName: string;
  contractorPhone: string | null;
}

export interface QuoteWidgetPorts {
  /** Must match lib/quote/machine.ts's attachPhoto contract exactly. */
  analyze?: (args: { imageBase64: string; mediaType: string }) => Promise<{
    surfaceTypeId?: string;
    estimatedSqft?: number;
    conditionModifierIds: string[];
    handToUser: VisionField[];
    photoPath?: string | null;
  } | null>;
  persistQuote?: (c: QuoteComputation, photoPath: string | null) => Promise<string | null>;
  submitLead?: (draft: {
    name: string;
    phone: string;
    email: string;
    timeline: string;
    wasDegraded: boolean;
    degradedReason: DbDegradedReason | null;
    quotePublicId: string | null;
  }) => Promise<void>;
  touchSession?: (args: { step: string; abandoned: boolean }) => void;
}

export interface QuoteWidgetProps {
  mode: WidgetMode;
  surface: Surface;
  config: WidgetConfig;
  prototypeId?: string | null;
  sessionId?: string | null;
  /** Server-resolved on first paint so the widget never starts optimistic. */
  initialDegraded?: { degraded: boolean; reason: DbDegradedReason | null };
  showStyleToggle?: boolean;
  ports?: QuoteWidgetPorts;
  quoteBaseUrl?: string;
  /** entry_point for the widget_opened event (EVENTS.md). */
  entryPoint?: string;
}

export function QuoteWidget(props: QuoteWidgetProps) {
  return (
    <MotionProvider>
      <QuoteMachineProvider
        mode={props.mode}
        surface={props.surface}
        prototypeId={props.prototypeId ?? null}
        sessionId={props.sessionId ?? null}
        ports={{
          analyze: props.ports?.analyze,
          persistQuote: props.ports?.persistQuote,
          submitLead: props.ports?.submitLead,
          touchSession: props.ports?.touchSession,
        }}
      >
        <WidgetBody {...props} />
      </QuoteMachineProvider>
    </MotionProvider>
  );
}

function WidgetBody({
  config,
  mode,
  surface,
  initialDegraded,
  showStyleToggle = false,
  quoteBaseUrl,
  entryPoint,
}: QuoteWidgetProps) {
  const store = useQuoteStore();
  const step = useQuoteMachine((s) => s.step);
  const sessionId = useQuoteMachine((s) => s.sessionId);
  const sqft = useQuoteMachine((s) => s.sqft);
  const surfaceTypeId = useQuoteMachine((s) => s.surfaceTypeId);
  const finishId = useQuoteMachine((s) => s.finishId);
  const finishTierKey = useQuoteMachine((s) => s.finishTierKey);
  const modifierIds = useQuoteMachine((s) => s.conditionModifierIds);
  const degraded = useQuoteMachine((s) => s.degraded);
  const busy = useQuoteMachine((s) => s.busy);
  const error = useQuoteMachine((s) => s.error);
  const quotePublicId = useQuoteMachine((s) => s.quotePublicId);

  const [colourId, setColourId] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);

  const evtCtx = useMemo(
    () => ({ surface, mode, sessionId: sessionId ?? undefined }),
    [surface, mode, sessionId]
  );

  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    track('widget_opened', { entry_point: entryPoint ?? surface }, evtCtx);
  }, [entryPoint, surface, evtCtx]);

  const stepNames: Record<string, { n: 1 | 2 | 3 | 4; name: string }> = {
    surface: { n: 1, name: 'surface' }, photo: { n: 1, name: 'surface' }, analyzing: { n: 1, name: 'surface' },
    finish: { n: 2, name: 'finish' },
    sqft: { n: 3, name: 'sqft' },
    quote: { n: 3, name: 'sqft' }, capture: { n: 4, name: 'capture' }, unlocked: { n: 4, name: 'capture' },
  };
  const prevUnlockedRef = useRef(false);
  useEffect(() => {
    const meta = stepNames[step];
    if (meta) track('quote_step_viewed', { step: meta.n, step_name: meta.name }, evtCtx);
    if (step === 'unlocked' && !prevUnlockedRef.current) {
      prevUnlockedRef.current = true;
      track('price_unblurred', {}, evtCtx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (initialDegraded?.degraded && initialDegraded.reason) {
      store.getState().enterDegraded(initialDegraded.reason);
    }
  }, [initialDegraded, store]);

  const effectiveSqft = sqft ?? Math.round((config.sqftMin + config.sqftMax) / 8);

  const computation = useMemo<QuoteComputation | null>(() => {
    if (!finishTierKey || !surfaceTypeId) return null;
    try {
      return calculateQuote(
        {
          sqft: effectiveSqft,
          surfaceTypeId,
          finishTierKey,
          conditionModifierIds: modifierIds,
          sqftMin: config.sqftMin,
          sqftMax: config.sqftMax,
        },
        config.rules
      );
    } catch {
      return null;
    }
  }, [effectiveSqft, surfaceTypeId, finishTierKey, modifierIds, config]);

  useEffect(() => {
    store.getState().setComputation(computation);
  }, [computation, store]);

  const surfaceOption = config.surfaceTypes.find((s) => s.id === surfaceTypeId) ?? null;

  const handlePhoto = useCallback(
    async (args: { base64: string; mediaType: string; previewUrl: string; originalBytes: number; finalBytes: number; durationMs: number }) => {
      track(
        'photo_compressed',
        { original_bytes: args.originalBytes, final_bytes: args.finalBytes, duration_ms: args.durationMs, output_format: args.mediaType },
        evtCtx
      );
      await store.getState().attachPhoto({ imageBase64: args.base64, mediaType: args.mediaType });
    },
    [store, evtCtx]
  );

  return (
    <section className="mx-auto w-full max-w-md bg-concrete p-4 text-ink" aria-label="Instant floor quote">
      {showStyleToggle ? (
        <div className="mb-4 flex justify-end">
          <StyleToggle enabled />
        </div>
      ) : null}

      {mode !== 'live' ? (
        <p className="mb-3 rounded-milled border border-rule bg-sheet px-3 py-1.5 font-data text-xs uppercase tracking-wide text-rule">
          {mode === 'prototype' ? 'Preview — nothing is sent' : 'Admin preview'}
        </p>
      ) : null}

      {degraded ? (
        <DegradedFlow
          contractorName={config.contractorName}
          contractorPhone={config.contractorPhone}
          surfaceLabel={surfaceOption?.label ?? null}
          acknowledged={step === 'degraded_acknowledged'}
          busy={busy}
          error={error}
          onSubmit={(fields) =>
            void store.getState().submitCapture({
              name: fields.name, phone: fields.phone, email: fields.email, timeline: fields.timeline,
            })
          }
        />
      ) : (
        <>
          {(step === 'surface' || step === 'photo' || step === 'analyzing') && (
            <StepSurface
              question={config.step1Question}
              options={config.surfaceTypes}
              selected={surfaceTypeId}
              onSelect={(id) => {
                store.getState().selectSurfaceType(id);
                track('surface_type_selected', { surface_type: id }, evtCtx);
              }}
              onPhotoReady={(a) => {
                setPhotoNote(null);
                track('photo_selected', { input_method: 'file', original_bytes: a.originalBytes, original_type: 'image/*' }, evtCtx);
                void handlePhoto(a);
              }}
              onSkipPhoto={() => {
                track('photo_skipped', { step: 1 }, evtCtx);
                store.getState().skipPhoto();
              }}
              analyzing={step === 'analyzing'}
              photoDisabledNote={photoNote}
            />
          )}

          {step === 'finish' && (
            <StepFinish
              options={config.finishes}
              selectedFinishId={finishId}
              selectedColourId={colourId}
              onSelect={({ finishId: fid, finishTierKey: tier, colourId: cid }) => {
                setColourId(cid);
                store.getState().selectFinish({ finishId: fid, finishTierKey: tier });
                track('finish_selected', { finish_id: fid, finish_tier: tier }, evtCtx);
              }}
            />
          )}

          {step === 'sqft' && (
            <StepArea
              sqft={effectiveSqft}
              sqftMin={config.sqftMin}
              sqftMax={config.sqftMax}
              onSqftChange={(v) => store.getState().setSqft(v)}
              onHelperPick={(v) => track('sqft_changed', { sqft: v, method: 'not_sure_helper' }, evtCtx)}
              typicalSqft={surfaceOption?.typicalSqft ?? []}
              computation={computation}
              modifiers={config.conditionModifiers.map((m) => ({ ...m, active: modifierIds.includes(m.id) }))}
              onToggleModifier={(id) => store.getState().toggleModifier(id)}
              onExpandBreakdown={() => track('breakdown_expanded', {}, evtCtx)}
              onContinue={() => void store.getState().commitQuote()}
            />
          )}

          {(step === 'quote' || step === 'capture' || step === 'unlocked') && computation && (
            <StepCapture
              lowCents={computation.lowCents}
              highCents={computation.highCents}
              unlocked={step === 'unlocked'}
              busy={busy}
              error={error}
              contractorName={config.contractorName}
              contractorPhone={config.contractorPhone}
              quoteUrl={quotePublicId && quoteBaseUrl ? quoteBaseUrl + '/q/' + quotePublicId : null}
              onViewed={() => track('capture_form_viewed', {}, evtCtx)}
              onSubmit={(fields: CaptureFields) => void store.getState().submitCapture(fields)}
            />
          )}

          {['finish', 'sqft', 'quote', 'capture'].includes(step) ? (
            <button
              type="button"
              onClick={() => store.getState().back()}
              className="mt-4 font-data text-sm text-rule underline underline-offset-4 hover:text-ink"
            >
              Back
            </button>
          ) : null}

          {step === 'finish' && finishTierKey ? (
            <button
              type="button"
              onClick={() => store.getState().goTo('sqft')}
              className="mt-4 min-h-[3rem] w-full rounded-milled bg-hazard px-4 font-body text-base font-semibold text-sheet"
            >
              Continue
            </button>
          ) : null}

          {step === 'surface' && surfaceTypeId ? (
            <button
              type="button"
              onClick={() => store.getState().skipPhoto()}
              className="mt-4 min-h-[3rem] w-full rounded-milled bg-hazard px-4 font-body text-base font-semibold text-sheet"
            >
              Continue
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
