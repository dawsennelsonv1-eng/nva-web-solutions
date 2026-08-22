'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, m, MotionProvider } from '@/lib/motion';
import { deriveSessionId } from '@/lib/analytics';
import { QuoteWidget } from '@/components/widget/QuoteWidget';
import { PayloadScreen } from './PayloadScreen';
import {
  getDemoWidgetCatalogue,
  getWidgetCatalogue,
  DEMO_CONTRACTOR,
  DEMO_VERTICAL,
  DEMO_SQFT_MIN,
  DEMO_SQFT_MAX,
  DEMO_RULES,
} from '@/lib/demo/config';
import { demoModifiers, verticalDemoFor } from '@/lib/demo/verticals';
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
  verticalId,
}: {
  surface: Extract<Surface, 'public_hub' | 'demo'>;
  entryPoint?: string;
  /**
   * Which trade to demonstrate. PHASE 88.
   *
   * OMITTED MEANS EPOXY, and omitted is what every existing caller does — the
   * homepage and /demo both mount this with no vertical and must keep behaving
   * exactly as before. That is why this is an optional prop on the working
   * component rather than a second copy of it: the orchestration below is 200
   * lines of session handling, port adapters and payload swapping, and a
   * duplicate would drift the moment either was touched.
   *
   * ANY OTHER VERTICAL TAKES THE DECLARED-STEPS PATH. `getDemoWidgetCatalogue`
   * deliberately withholds `steps` so epoxy keeps its hand-built flow — the one
   * surface where a subtle regression costs real inbound. A trade built after
   * that decision has no hand-built flow to protect and its module's declared
   * plan IS its flow, so it gets steps and renders them.
   */
  verticalId?: string;
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

  /**
   * EPOXY KEEPS THE EXACT OBJECT IT ALWAYS HAD. Anything else is built from its
   * own module and its own published rate document, and carries `steps`.
   *
   * `doc` being null for a requested vertical is not an error — it means no
   * published rates exist for that trade yet, and the caller should not have
   * mounted this. Falling back to epoxy would quote a fence against floor rates,
   * so the guard below refuses instead.
   */
  const requested = verticalId ?? DEMO_VERTICAL;
  const doc = requested === DEMO_VERTICAL ? null : verticalDemoFor(requested);
  const isEpoxy = requested === DEMO_VERTICAL;

  /**
   * TWO VARIABLES, NOT ONE, AND THE REASON IS TYPES RATHER THAN TASTE.
   *
   * `getWidgetCatalogue` returns `WidgetCatalogue`, whose `steps` is
   * `StepDescriptor[]`. `getDemoWidgetCatalogue` returns an inferred object
   * literal that deliberately has no `steps` at all. Assigning a ternary of the
   * two to one variable produces a union, and reading `steps` off that union —
   * even behind an `in` check — degraded it to `unknown`, which `WidgetConfig`
   * rightly refused. That was a build failure.
   *
   * Keeping the vertical catalogue in its own properly-typed variable means
   * `declaredSteps` is `StepDescriptor[] | undefined` with no cast. Casting
   * would have silenced the compiler while leaving the next reader unsure
   * whether the shape was ever checked.
   */
  const verticalCatalogue = isEpoxy
    ? null
    : getWidgetCatalogue(requested, demoModifiers(requested));
  const catalogue = verticalCatalogue ?? getDemoWidgetCatalogue();
  const declaredSteps = verticalCatalogue?.steps;
  /**
   * A vertical was asked for and has no published rates. Refuse rather than
   * fall back: DEMO_RULES is epoxy's, and pricing a fence run against floor
   * rates would produce a confident number in the wrong units — the exact
   * failure pricerFor() returning null exists to prevent.
   */
  if (!isEpoxy && !doc) return null;


  async function analyzeAdapter(args: { imageBase64: string; mediaType: string }) {
    const res = await analyzePhotoAction({
      mode: 'live',
      surface,
      prototypeId: null,
      sessionId: sessionId as string,
      vertical: requested,
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
    return persistDemoQuote(computation, {
      surface,
      sessionId: sessionId as string,
      usedAiAnalysis: usedAiRef.current,
      photoPath,
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
    /** Phase 14: the finish render the homeowner was shown, if any. */
    renderPath?: string | null;
  }) {
    const result = await submitDemoLead({
      surface,
      sessionId: sessionId as string,
      // Passed through so the contractor receives the picture the homeowner
      // was actually looking at when he gave his details.
      renderPath: draft.renderPath ?? null,
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

  /**
   * ==========================================================================
   * THE PROVIDER IS INSIDE THIS COMPONENT NOW, AND MUST STAY HERE. PHASE 40.
   * ==========================================================================
   *
   * THE BUG IT FIXES. The root below is `<AnimatePresence><m.div
   * initial={{opacity: 0}} animate={{opacity: 1}}>`. `m` comes from
   * framer-motion's LazyMotion build and only receives animation features
   * inside a `<LazyMotion>` tree, which is all MotionProvider is. Outside one
   * these still RENDER — they simply never animate. So `initial` applies,
   * `animate` never runs, and the whole widget sits in the DOM at opacity 0:
   * present, focusable, correct markup in the inspector, invisible on screen,
   * nothing in the console. That is worse than a crash.
   *
   * WHY IT WENT UNNOTICED FOR SO LONG. Phase 13B removed MotionProvider from
   * app/(public)/layout.tsx reasoning that "the widget brings its own
   * MotionProvider (see QuoteWidget), so routes that mount it are
   * unaffected." That is true OF QuoteWidget — but this component wraps
   * QuoteWidget in its own `m.div` ONE LEVEL ABOVE that provider. The layer
   * that needed the context was the layer nobody checked. /demo has been blank
   * ever since.
   *
   * WHY IT BELONGS HERE RATHER THAN AT EACH MOUNT. The tool page carried this
   * wrapper with a comment explaining that any route mounting DemoExperience
   * directly must provide it — a rule that lives in a comment on ONE caller
   * and has to be rediscovered by every future one, at the cost of a silently
   * invisible widget each time. A component whose own root needs animation
   * features should carry them. Now it cannot be forgotten, because there is
   * nothing left to remember.
   *
   * NESTING IS FREE. MotionProvider renders no DOM — it is exactly
   * `<LazyMotion features={domAnimation} strict>` — and LazyMotion loads its
   * feature bundle once however deep the tree goes. QuoteWidget mounts another
   * one below this, and has done since before this change; that pairing ships
   * and works today. So any caller that still wraps this component is harmless
   * rather than wrong.
   */
  return (
    <MotionProvider>
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
                vertical: requested,
                step1Question: catalogue.step1Question,
                surfaceTypes: catalogue.surfaceTypes,
                finishes: catalogue.finishes,
                rules: doc ? doc.rules : DEMO_RULES,
                sqftMin: doc ? doc.sqftMin : DEMO_SQFT_MIN,
                sqftMax: doc ? doc.sqftMax : DEMO_SQFT_MAX,
                conditionModifiers: catalogue.conditionModifiers,
                contractorName: DEMO_CONTRACTOR.name,
                contractorPhone: DEMO_CONTRACTOR.phone,
                /* Only the non-epoxy path gets steps. See the note on the
                   verticalId prop for why epoxy is left alone. */
                ...(declaredSteps ? { steps: declaredSteps } : {}),
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
    </MotionProvider>
  );
}



