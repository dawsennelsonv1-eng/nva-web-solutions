'use client';

import { useEffect, useRef, useState } from 'react';
import { deriveSessionId } from '@/lib/analytics';
import { track } from '@/lib/analytics.client';
import { QuoteWidget, type WidgetConfig } from '@/components/widget/QuoteWidget';
import { analyzePhotoAction, persistQuoteAction, touchSessionAction } from '@/app/actions/quote';
import { submitPrototypeLead } from '@/app/actions/prototypeLead';
import { AnalysisDegradedSignal } from '@/lib/quote/machine';
import type { QuoteComputation } from '@/lib/quote/pricing';
import type { StepDescriptor } from '@/lib/verticals/registry';
import type { DbDegradedReason, Surface } from '@/types';

/**
 * components/prototype/PrototypeExperience.tsx — the real ports, wired to
 * the real product's own server actions (Phase 3's analyzePhotoAction /
 * persistQuoteAction / touchSessionAction — the SAME ones a paying
 * customer's live site will use once this prototype graduates to mode
 * 'live'). Same adapter shape as components/demo/DemoExperience.tsx
 * (Phase 5): the pattern is proven, and reusing it here means the analyze
 * port's AnalysisDegradedSignal handling and the persistQuote photoPath
 * threading (Phase 6) both carry over with no rediscovery.
 *
 * WHAT DIFFERS FROM DemoExperience: prototypeId is REAL (not null), the
 * quote_config is the CONTRACTOR'S OWN rates (not DEMO_RULES), and
 * submitLead calls submitPrototypeLead — writing a real lead against a real
 * prototype_id, notifying the admin rather than a fake persona. There is no
 * split-screen payload here; item 5's purchase CTA is a separate, always-
 * visible component below this one, not something that swaps in after
 * submission.
 */

export function PrototypeExperience({
  prototypeId,
  surface,
  vertical,
  step1Question,
  contractorName,
  contractorPhone,
  sqftMin,
  sqftMax,
  rules,
  finishes,
  surfaceTypes,
  conditionModifiers,
  styleVariant,
  initialDegraded,
  steps,
}: {
  prototypeId: string;
  surface: Extract<Surface, 'prototype'>;
  vertical: string;
  step1Question: string;
  contractorName: string;
  contractorPhone: string | null;
  sqftMin: number;
  sqftMax: number;
  rules: unknown;
  finishes: WidgetConfig['finishes'];
  surfaceTypes: WidgetConfig['surfaceTypes'];
  conditionModifiers: { id: string; label: string }[];
  styleVariant: 'light' | 'dark-industrial';
  initialDegraded: { degraded: boolean; reason: string | null };
  /**
   * PHASE 11. The vertical module's declared questions. Optional so any caller
   * that has not been updated still renders the Phase 4 flow rather than
   * failing to compile — but PrototypeView always supplies it now, which is
   * what makes a painting prototype ask about coats and prep instead of
   * silently pricing as if it were a floor.
   */
  steps?: StepDescriptor[];
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const usedAiRef = useRef(false);
  const mountedAtRef = useRef(0);
  const stepReachedRef = useRef(new Set<number>());

  useEffect(() => {
    setSessionId(deriveSessionId());
    mountedAtRef.current = Date.now();
  }, []);

  if (!sessionId) return <div className="mx-auto w-full max-w-md p-4" aria-hidden />;

  async function analyzeAdapter(args: { imageBase64: string; mediaType: string }) {
    const res = await analyzePhotoAction({
      mode: 'prototype',
      surface,
      prototypeId,
      sessionId: sessionId as string,
      vertical,
      imageBase64: args.imageBase64,
      mediaType: args.mediaType as 'image/jpeg' | 'image/webp' | 'image/png',
    });

    if (res.status === 'degraded') {
      throw new AnalysisDegradedSignal((res.degradedReason ?? 'ai_unavailable') as DbDegradedReason);
    }
    if (res.status === 'manual_entry' || !res.hints) return null;

    usedAiRef.current = true;
    return {
      surfaceTypeId: res.hints.surfaceTypeId,
      estimatedSqft: res.hints.estimatedSqft,
      conditionModifierIds: res.hints.conditionModifierIds,
      handToUser: res.hints.handToUser,
      photoPath: res.photoPath ?? null,
      // PHASE 11: the module's own inputs, keyed by its writesTo keys. The
      // three fields above are a projection of this for Phase 4 components;
      // this is the set that carries a painting prep level or coat count.
      answers: res.hints.answers,
    };
  }

  async function persistQuoteAdapter(computation: QuoteComputation, photoPath: string | null) {
    const result = await persistQuoteAction({
      mode: 'prototype',
      surface,
      prototypeId,
      sessionId: sessionId as string,
      vertical,
      input: computation.inputs,
      usedAiAnalysis: usedAiRef.current,
      photoPath,
    });
    return result.publicId;
  }

  async function submitLeadAdapter(draft: {
    name: string; phone: string; email: string; timeline: string;
    wasDegraded: boolean; degradedReason: DbDegradedReason | null; quotePublicId: string | null;
  }) {
    const result = await submitPrototypeLead({
      prototypeId,
      sessionId: sessionId as string,
      name: draft.name,
      phone: draft.phone,
      email: draft.email,
      timeline: draft.timeline,
      wasDegraded: draft.wasDegraded,
      degradedReason: draft.degradedReason,
      quotePublicId: draft.quotePublicId,
      timeInWidgetMs: Date.now() - mountedAtRef.current,
    });
    if (!result.ok) throw new Error(result.error);
  }

  function touchSessionAdapter(args: { step: string; abandoned: boolean }) {
    void touchSessionAction({
      sessionId: sessionId as string,
      surface,
      mode: 'prototype',
      prototypeId,
      step: args.step,
      abandoned: args.abandoned,
      timeInWidgetMs: Date.now() - mountedAtRef.current,
    });

    // "How far he got" — a dedicated event distinct from the widget's own
    // quote_step_viewed (which already fires for aggregate funnel analytics
    // across every surface). This one exists so Dawsen can query THIS
    // prototype_id's progress specifically, live, mid-phone-call.
    const stepNumber = stepNumberFor(args.step, steps);
    if (stepNumber && !stepReachedRef.current.has(stepNumber)) {
      stepReachedRef.current.add(stepNumber);
      track('prototype_step_reached', { step: stepNumber }, { surface, mode: 'prototype', sessionId: sessionId as string, prototypeId });
    }
  }

  return (
    <QuoteWidget
      mode="prototype"
      surface={surface}
      sessionId={sessionId}
      prototypeId={prototypeId}
      entryPoint="prototype_launch"
      initialDegraded={{ degraded: initialDegraded.degraded, reason: initialDegraded.reason as DbDegradedReason | null }}
      showStyleToggle
      config={{
        vertical,
        step1Question,
        surfaceTypes,
        finishes,
        rules,
        sqftMin,
        sqftMax,
        conditionModifiers,
        contractorName,
        contractorPhone,
        steps,
      }}
      ports={{
        analyze: analyzeAdapter,
        persistQuote: persistQuoteAdapter,
        submitLead: submitLeadAdapter,
        touchSession: touchSessionAdapter,
      }}
    />
  );
}

const STEP_NUMBERS: Record<string, number> = {
  surface: 1, photo: 1, analyzing: 1,
  finish: 2,
  sqft: 3, quote: 3,
  capture: 4, unlocked: 4,
  degraded_capture: 4, degraded_acknowledged: 4,
};

/**
 * "How far he got", as a number from 1 to 4, for ANY vertical.
 *
 * The table above is epoxy's five step ids and nothing else, which was correct
 * when epoxy was the only trade. Painting's plan has ids the table has never
 * heard of ('area', 'coats', 'prep'), and an unmapped id means the event never
 * fires — the admin watching a live prototype mid-phone-call would see a
 * painting visitor simply stop reporting progress.
 *
 * So: known ids keep their exact Phase 8 numbers, and anything else is placed
 * by its POSITION in the declared plan, squeezed into buckets 1-3 with the
 * terminals still at 4. Coarse on purpose — the question this answers is "did
 * he get near the end", not "which control did he touch".
 */
function stepNumberFor(step: string, steps: StepDescriptor[] | undefined): number | undefined {
  const known = STEP_NUMBERS[step];
  if (known) return known;
  if (!steps || steps.length === 0) return undefined;
  const idx = steps.findIndex((s) => s.id === step);
  if (idx < 0) return undefined;
  return 1 + Math.min(2, Math.floor((idx * 3) / steps.length));
}
