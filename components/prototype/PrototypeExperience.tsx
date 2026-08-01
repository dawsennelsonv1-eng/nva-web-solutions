'use client';

import { useEffect, useRef, useState } from 'react';
import { deriveSessionId } from '@/lib/analytics';
import { track } from '@/lib/analytics.client';
import { QuoteWidget, type WidgetConfig } from '@/components/widget/QuoteWidget';
import { analyzePhotoAction, persistQuoteAction, touchSessionAction } from '@/app/actions/quote';
import { submitPrototypeLead } from '@/app/actions/prototypeLead';
import { AnalysisDegradedSignal } from '@/lib/quote/machine';
import type { QuoteComputation } from '@/lib/quote/pricing';
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
    const stepNumber = STEP_NUMBERS[args.step];
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
