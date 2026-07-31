'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MotionProvider } from '@/lib/motion';
import { calculateQuote, type QuoteComputation } from '@/lib/quote/pricing';
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
 * MODE IS A REQUIRED PROP with no default and no route inference (R-123).
 * 'live' captures for real, 'prototype' lets the contractor test-drive without
 * consuming his own quota, 'preview' writes nothing anywhere. Inferring it
 * from the URL is how a sales demo eventually eats a paying customer's month.
 *
 * PRICING RUNS CLIENT-SIDE, from the contractor's own quote_config, because
 * the datum rule has to answer while a thumb is still moving. The server
 * recomputes from the same config before persisting, so the client is fast and
 * the record is authoritative — pricing.ts is pure and isomorphic precisely to
 * allow that split.
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
  analyze?: (args: {
    imageBase64: string;
    mediaType: string;
  }) => Promise<{
    status: 'ok' | 'manual_entry' | 'degraded';
    surfaceTypeId?: string;
    estimatedSqft?: number;
    conditionModifierIds?: string[];
    degradedReason?: DbDegradedReason;
    message?: string;
  }>;
  persistQuote?: (c: QuoteComputation) => Promise<string | null>;
  submitLead?: (draft: unknown) => Promise<void>;
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
}

export function QuoteWidget(props: QuoteWidgetProps) {
  return (
    <MotionProvider>
      <QuoteMachineProvider
        mode={props.mode}
        surface={props.surface}
        prototypeId={props.prototypeId ?? null}
        sessionId={props.sessionId ?? null}
        ports={{ touchSession: props.ports?.touchSession }}
      >
        <WidgetBody {...props} />
      </QuoteMachineProvider>
    </MotionProvider>
  );
}

function WidgetBody({
  config,
  mode,
  initialDegraded,
  showStyleToggle = false,
  ports = {},
  quoteBaseUrl,
}: QuoteWidgetProps) {
  const store = useQuoteStore();
  const step = useQuoteMachine((s) => s.step);
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

  // The server already resolved entitlement; enter degraded before the
  // visitor is shown anything that promises an instant figure.
  useEffect(() => {
    if (initialDegraded?.degraded && initialDegraded.reason) {
      store.getState().enterDegraded(initialDegraded.reason);
    }
  }, [initialDegraded, store]);

  const effectiveSqft = sqft ?? Math.round((config.sqftMin + config.sqftMax) / 8);

  /**
   * Recomputed synchronously on every input change. Pure, no I/O, no network,
   * so the span redraws in the same frame the thumb moves.
   */
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
      // A malformed config must not blank the widget; the visitor still
      // reaches lead capture, which is the part that is never allowed to stop.
      return null;
    }
  }, [effectiveSqft, surfaceTypeId, finishTierKey, modifierIds, config]);

  useEffect(() => {
    store.getState().setComputation(computation);
  }, [computation, store]);

  const surfaceOption = config.surfaceTypes.find((s) => s.id === surfaceTypeId) ?? null;

  const handlePhoto = useCallback(
    async (args: { base64: string; mediaType: string; previewUrl: string }) => {
      const s = store.getState();
      if (!ports.analyze) {
        s.attachPhoto({ imageBase64: args.base64, mediaType: args.mediaType });
        return;
      }
      await s.attachPhoto({ imageBase64: args.base64, mediaType: args.mediaType });
    },
    [store, ports.analyze]
  );

  return (
    <section
      className="mx-auto w-full max-w-md bg-concrete p-4 text-ink"
      aria-label="Instant floor quote"
    >
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
              name: fields.name,
              phone: fields.phone,
              email: fields.email,
              timeline: fields.timeline,
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
              }}
              onPhotoReady={(a) => {
                setPhotoNote(null);
                void handlePhoto(a);
              }}
              onSkipPhoto={() => store.getState().skipPhoto()}
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
              }}
            />
          )}

          {step === 'sqft' && (
            <StepArea
              sqft={effectiveSqft}
              sqftMin={config.sqftMin}
              sqftMax={config.sqftMax}
              onSqftChange={(v) => store.getState().setSqft(v)}
              typicalSqft={surfaceOption?.typicalSqft ?? []}
              computation={computation}
              modifiers={config.conditionModifiers.map((m) => ({
                ...m,
                active: modifierIds.includes(m.id),
              }))}
              onToggleModifier={(id) => store.getState().toggleModifier(id)}
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
              onSubmit={(fields: CaptureFields) =>
                void store.getState().submitCapture(fields)
              }
            />
          )}

          {/* Back is available on every reversible step and nowhere else. */}
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
