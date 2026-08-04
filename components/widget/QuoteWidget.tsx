'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MotionProvider } from '@/lib/motion';
import { calculateQuote, type QuoteComputation } from '@/lib/quote/pricing';
import { priceQuote } from '@/lib/quote/price-quote';
import type { StepDescriptor } from '@/lib/verticals/registry';
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
 *
 * === PHASE 11: TWO RENDER PATHS ===
 *
 * Supply `config.steps` (a vertical module's StepDescriptor[]) and this file
 * renders the module's DECLARED plan: it walks the visible steps in order and
 * picks a control per step. Omit it and every line of the Phase 4 render below
 * runs unchanged, because /demo and /s/[slug] still mount it that way and a
 * required new field would red a build I cannot compile locally.
 *
 * WHAT THE DYNAMIC PATH DOES NOT YET DO, stated plainly rather than buried:
 * three of the Phase 4 components are COMPOSITES that each own two of the
 * module's declared steps — StepSurface bundles the surface choice with the
 * photo, StepFinish bundles finish with colour, StepArea bundles the quantity
 * slider with the condition modifiers. So a declared `photo`, `colour_select`
 * or `multi_select` step is ABSORBED by its composite rather than rendered on
 * its own, and the dynamic renderer skips it. Painting works because the two
 * things epoxy never had — a coat stepper and a prep-level choice — are the
 * two kinds that get real generic renderers here. Decomposing the composites
 * is a separate, larger job and does not belong in the same push as the
 * contract change.
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
  /**
   * PHASE 11. The vertical module's declared steps. When present the widget
   * renders the module's plan; when absent it renders the Phase 4 flow.
   */
  steps?: StepDescriptor[];
}

export interface QuoteWidgetPorts {
  /** Must match lib/quote/machine.ts's attachPhoto contract exactly. */
  analyze?: (args: { imageBase64: string; mediaType: string }) => Promise<{
    surfaceTypeId?: string;
    estimatedSqft?: number;
    conditionModifierIds: string[];
    handToUser: VisionField[];
    photoPath?: string | null;
    /** PHASE 11: vertical-shaped hints keyed by the module's writesTo keys. */
    answers?: Record<string, unknown>;
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

/** Kinds the dynamic renderer draws itself. Everything else is absorbed. */
const RENDERED_KINDS = [
  'surface_select',
  'quantity',
  'finish_select',
  'stepper',
  'single_select',
];

export function QuoteWidget(props: QuoteWidgetProps) {
  return (
    <MotionProvider>
      <QuoteMachineProvider
        mode={props.mode}
        surface={props.surface}
        prototypeId={props.prototypeId ?? null}
        sessionId={props.sessionId ?? null}
        steps={props.config.steps}
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
  const answers = useQuoteMachine((s) => s.answers);
  const degraded = useQuoteMachine((s) => s.degraded);
  const busy = useQuoteMachine((s) => s.busy);
  const error = useQuoteMachine((s) => s.error);
  const quotePublicId = useQuoteMachine((s) => s.quotePublicId);

  const [colourId, setColourId] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);

  const dynamic = (config.steps?.length ?? 0) > 0;

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

  /**
   * THE PRICE. Legacy mode calls the area x tier kernel directly, exactly as
   * Phase 4 did. Dynamic mode asks the MODULE to price its own answers, which
   * is the whole point of the v2 contract — this file no longer knows any
   * trade's formula.
   */
  const computation = useMemo<QuoteComputation | null>(() => {
    if (dynamic) {
      try {
        const computed = priceQuote({
          verticalId: config.vertical,
          rawInputs: {
            ...answers,
            sqftMin: config.sqftMin,
            sqftMax: config.sqftMax,
          },
          rawRules: config.rules,
        });
        // The kernel-narrowed alias differs only in the type of its `inputs`
        // echo, which nothing downstream reads. Cast rather than widen every
        // Phase 4-6 signature in a push I cannot compile locally.
        return computed as unknown as QuoteComputation;
      } catch {
        return null;
      }
    }
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
  }, [dynamic, answers, effectiveSqft, surfaceTypeId, finishTierKey, modifierIds, config]);

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

  /** The visible plan, minus the kinds a composite already owns. */
  const plan = useMemo<StepDescriptor[]>(() => {
    if (!dynamic) return [];
    return store
      .getState()
      .visiblePlan()
      .filter((s) => RENDERED_KINDS.includes(s.control.kind));
    // answers is the dependency that actually moves visibility
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamic, answers, store]);

  const current = plan.find((s) => s.id === step) ?? null;
  const isLastQuestion = plan.length > 0 && plan[plan.length - 1]?.id === step;

  const advance = useCallback(() => {
    const s = store.getState();
    if (isLastQuestion) void s.commitQuote();
    else s.next();
  }, [store, isLastQuestion]);

  return (
    <section className="mx-auto w-full max-w-md bg-concrete p-4 text-ink" aria-label="Instant quote">
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
      ) : dynamic ? (
        <>
          {current?.control.kind === 'surface_select' && (
            <StepSurface
              question={current.question}
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
              analyzing={busy}
              photoDisabledNote={photoNote}
            />
          )}

          {current?.control.kind === 'finish_select' && (
            <StepFinish
              options={config.finishes}
              selectedFinishId={finishId}
              selectedColourId={colourId}
              onSelect={({ finishId: fid, finishTierKey: tier, colourId: cid }) => {
                setColourId(cid);
                store.getState().selectFinish({ finishId: fid, finishTierKey: tier });
                store.getState().setAnswer('colourId', cid);
                track('finish_selected', { finish_id: fid, finish_tier: tier }, evtCtx);
              }}
            />
          )}

          {current?.control.kind === 'quantity' && (
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
              onContinue={advance}
            />
          )}

          {current?.control.kind === 'stepper' && (
            <StepperControl
              step={current}
              value={typeof answers[current.writesTo] === 'number' ? (answers[current.writesTo] as number) : current.control.min}
              onChange={(v) => store.getState().setAnswer(current.writesTo, v)}
              onContinue={advance}
            />
          )}

          {current?.control.kind === 'single_select' && (
            <ChoiceControl
              step={current}
              selected={typeof answers[current.writesTo] === 'string' ? (answers[current.writesTo] as string) : null}
              onSelect={(id) => {
                store.getState().setAnswer(current.writesTo, id);
                advance();
              }}
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

          {current && current.control.kind !== 'quantity' && current.control.kind !== 'single_select' ? (
            <button
              type="button"
              onClick={advance}
              className="mt-4 min-h-[3rem] w-full rounded-milled bg-hazard px-4 font-body text-base font-semibold text-sheet"
            >
              Continue
            </button>
          ) : null}

          {current && plan[0]?.id !== step ? (
            <button
              type="button"
              onClick={() => store.getState().back()}
              className="mt-4 font-data text-sm text-rule underline underline-offset-4 hover:text-ink"
            >
              Back
            </button>
          ) : null}
        </>
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

/**
 * Generic small-integer control — painting's coat count, roofing's layer
 * count. Targets are 3rem so a thumb hits them at 360px, and the value is
 * announced live so it is not a mystery to a screen reader.
 */
function StepperControl({
  step,
  value,
  onChange,
  onContinue,
}: {
  step: StepDescriptor;
  value: number;
  onChange: (v: number) => void;
  onContinue: () => void;
}) {
  if (step.control.kind !== 'stepper') return null;
  const { min, max, unitLabel } = step.control;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  return (
    <div className="space-y-4">
      <h2 className="font-display font-condensed text-xl font-bold">{step.question}</h2>
      {step.help ? <p className="font-body text-sm text-rule">{step.help}</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          aria-label={'Fewer ' + unitLabel}
          className="min-h-[3rem] min-w-[3rem] rounded-milled border border-rule bg-sheet font-data text-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
        >
          −
        </button>
        <output
          aria-live="polite"
          className="flex-1 rounded-milled border border-rule bg-sheet py-3 text-center font-data text-lg"
        >
          {value} {unitLabel}
        </output>
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          aria-label={'More ' + unitLabel}
          className="min-h-[3rem] min-w-[3rem] rounded-milled border border-rule bg-sheet font-data text-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
        >
          +
        </button>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="min-h-[3rem] w-full rounded-milled bg-hazard px-4 font-body text-base font-semibold text-sheet"
      >
        Continue
      </button>
    </div>
  );
}

/**
 * Generic one-of-N control — painting's prep level. Full-width rows rather
 * than a select, for the same reason StepSurface uses tiles: a dropdown is the
 * first signal that this is a form.
 */
function ChoiceControl({
  step,
  selected,
  onSelect,
}: {
  step: StepDescriptor;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (step.control.kind !== 'single_select') return null;
  const options = step.control.options;

  return (
    <div className="space-y-4">
      <h2 className="font-display font-condensed text-xl font-bold">{step.question}</h2>
      {step.help ? <p className="font-body text-sm text-rule">{step.help}</p> : null}

      <div className="space-y-2" role="radiogroup" aria-label={step.question}>
        {options.map((o) => {
          const active = o.id === selected;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(o.id)}
              className={
                'block w-full rounded-milled border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
                (active ? 'border-hazard bg-hazard text-sheet' : 'border-rule bg-sheet text-ink')
              }
            >
              <span className="block font-body text-base font-semibold">{o.label}</span>
              {o.helpText ? (
                <span className={'mt-0.5 block font-body text-sm ' + (active ? 'text-sheet/80' : 'text-rule')}>
                  {o.helpText}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
