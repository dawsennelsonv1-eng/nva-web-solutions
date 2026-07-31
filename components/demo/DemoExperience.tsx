'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, m } from '@/lib/motion';
import { deriveSessionId } from '@/lib/analytics';
import { QuoteWidget } from '@/components/widget/QuoteWidget';
import { PayloadScreen } from './PayloadScreen';
import {
  getDemoWidgetCatalogue,
  DEMO_CONTRACTOR,
  DEMO_VERTICAL,
  DEMO_SQFT_MIN,
  DEMO_SQFT_MAX,
  DEMO_RULES,
} from '@/lib/demo/config';
import { analyzePhotoAction, touchSessionAction } from '@/app/actions/quote';
import { persistDemoQuote, submitDemoLead, type SplitScreenPayload } from '@/app/actions/lead';
import { AnalysisDegradedSignal } from '@/lib/quote/machine';
import type { QuoteComputation } from '@/lib/quote/pricing';
import type { DbDegradedReason, Surface } from '@/types';

/**
 * components/demo/DemoExperience.tsx — the orchestrator for DUAL ROUTING.
 *
 * One engine, mounted from two routes: app/(public)/page.tsx passes
 * surface="public_hub", app/(public)/demo/page.tsx passes surface="demo".
 * Everything else — the widget, the port adapters, the payload swap — is
 * identical, which is the whole point: a single, real, working conversion
 * mechanism serving two entry points, rather than two half-built ones.
 *
 * THIS FILE IS WHERE THE REAL PORTS LIVE. QuoteWidget.tsx just renders
 * whatever ports it's given; the actual calls to the Phase 3 server actions
 * (analyzePhotoAction, persistQuoteAction's demo counterpart, submitDemoLead)
 * happen here, where the component has the session id and can hold the
 * split-screen payload in state once the machine reports success.
 *
 * THE analyze ADAPTER IS THE ONE PLACE analyzePhotoAction's THREE-STATUS
 * RESPONSE ('ok' | 'manual_entry' | 'degraded') gets translated into the
 * TWO-OUTCOME CONTRACT lib/quote/machine.ts's attachPhoto actually consumes
 * (hints-or-null, plus the thrown AnalysisDegradedSignal for the one case a
 * return value can't express). That translation belongs at the boundary
 * where a real backend meets the machine — not inside the machine itself,
 * which stays free of any knowledge of what a "status" field is.
 */

export function DemoExperience({
  surface,
  entryPoint,
}: {
  surface: Extract<Surface, 'public_hub' | 'demo'>;
  entryPoint?: string;
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [payload, setPayload] = useState<SplitScreenPayload | null>(null);
  const usedAiRef = useRef(false);
  const mountedAtRef = useRef(0);

  useEffect(() => {
    setSessionId(deriveSessionId());
    mountedAtRef.current = Date.now();
  }, []);

  if (!sessionId) {
    // One render tick on the client before sessionStorage is available.
    // Not worth a spinner — the widget appears essentially immediately.
    return <div className="mx-auto w-full max-w-md p-4" aria-hidden />;
  }

  const catalogue = getDemoWidgetCatalogue();

  async function analyzeAdapter(args: { imageBase64: string; mediaType: string }) {
    const res = await analyzePhotoAction({
      mode: 'live',
      surface,
      prototypeId: null,
      sessionId: sessionId as string,
      vertical: DEMO_VERTICAL,
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
    };
  }

  async function persistQuoteAdapter(computation: QuoteComputation) {
    return persistDemoQuote(computation, {
      surface,
      sessionId: sessionId as string,
      usedAiAnalysis: usedAiRef.current,
    });
  }

  async function submitLeadAdapter(draft: {
    name: string;
    phone: string;
    email: string;
    timeline: string;
    wasDegraded: boolean;
    degradedReason: DbDegradedReason | null;
    quotePublicId: string | null;
  }) {
    const result = await submitDemoLead({
      surface,
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
    if (!result.ok) {
      // machine.ts's submitCapture shows its own generic retry copy on any
      // thrown error; the specific reason still travels for anyone reading
      // server logs, it's just not what the visitor sees.
      throw new Error(result.error);
    }
    setPayload(result.payload);
  }

  function touchSessionAdapter(args: { step: string; abandoned: boolean }) {
    void touchSessionAction({
      sessionId: sessionId as string,
      surface,
      mode: 'live',
      prototypeId: null,
      step: args.step,
      abandoned: args.abandoned,
      timeInWidgetMs: Date.now() - mountedAtRef.current,
    });
  }

  return (
    <AnimatePresence mode="wait">
      {payload ? (
        <m.div
          key="payload"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <PayloadScreen
            payload={payload}
            surface={surface}
            onPurchaseClick={() => router.push('/pricing?plan=foundation&from=' + surface)}
          />
        </m.div>
      ) : (
        <m.div
          key="widget"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <QuoteWidget
            mode="live"
            surface={surface}
            sessionId={sessionId}
            prototypeId={null}
            entryPoint={entryPoint}
            config={{
              vertical: DEMO_VERTICAL,
              step1Question: catalogue.step1Question,
              surfaceTypes: catalogue.surfaceTypes,
              finishes: catalogue.finishes,
              rules: DEMO_RULES,
              sqftMin: DEMO_SQFT_MIN,
              sqftMax: DEMO_SQFT_MAX,
              conditionModifiers: catalogue.conditionModifiers,
              contractorName: DEMO_CONTRACTOR.name,
              contractorPhone: DEMO_CONTRACTOR.phone,
            }}
            ports={{
              analyze: analyzeAdapter,
              persistQuote: persistQuoteAdapter,
              submitLead: submitLeadAdapter,
              touchSession: touchSessionAdapter,
            }}
          />
        </m.div>
      )}
    </AnimatePresence>
  );
}
