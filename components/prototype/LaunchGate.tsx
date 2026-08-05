'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { track } from '@/lib/analytics.client';
import type { WidgetConfig } from '@/components/widget/QuoteWidget';
import type { StepDescriptor } from '@/lib/verticals/registry';
import type { Surface } from '@/types';

/**
 * components/prototype/LaunchGate.tsx — THE LCP LEVER.
 *
 * "Hero with the widget launch button" (item 2) is a product requirement
 * that happens to solve the phase's hard limit as a side effect, and this
 * component is where that connection is made explicit: the widget's entire
 * bundle — Phase 4's steps, Phase 3's machine, the image pipeline's dynamic
 * import chain — is not just deferred until interaction, it is not present
 * in the page's JavaScript AT ALL until the button is tapped. `next/dynamic`
 * with no `loading` prop and this component never importing PrototypeExperience
 * at module scope means the largest content on first paint is the SERVER-
 * RENDERED hero (headline, logo, orientation line) sitting in ./LaunchGate's
 * parent — plain HTML and the Phase 7 brand CSS vars, nothing blocking it.
 * On a truck's 4G connection, the difference between "ships 50KB of widget
 * JS before first paint" and "ships 0KB" is most of the 2-second budget.
 *
 * `prototype_widget_launched` fires on the tap, before the dynamic import
 * resolves — the event that matters is the intent, not the load time.
 */

const PrototypeExperience = dynamic(
  () => import('./PrototypeExperience').then((m) => m.PrototypeExperience),
  { ssr: false }
);

export function LaunchGate({
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
   * PHASE 11. Passed straight through. This component's whole job is keeping
   * the widget bundle out of first paint, and a plain array of step
   * descriptors is data, not code — forwarding it costs the LCP nothing.
   */
  steps?: StepDescriptor[];
}) {
  const [launched, setLaunched] = useState(false);
  const evtCtx = { surface, mode: 'prototype' as const };
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    track('prototype_opened', { slug: prototypeId, referrer_type: detectReferrer() }, evtCtx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (launched) {
    return (
      <PrototypeExperience
        prototypeId={prototypeId}
        surface={surface}
        vertical={vertical}
        step1Question={step1Question}
        contractorName={contractorName}
        contractorPhone={contractorPhone}
        sqftMin={sqftMin}
        sqftMax={sqftMax}
        rules={rules}
        finishes={finishes}
        surfaceTypes={surfaceTypes}
        conditionModifiers={conditionModifiers}
        styleVariant={styleVariant}
        initialDegraded={initialDegraded}
        steps={steps}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        track('prototype_widget_launched', {}, evtCtx);
        setLaunched(true);
      }}
      className="flex min-h-[3.5rem] w-full items-center justify-center gap-2 rounded-milled bg-hazard px-6 font-body text-lg font-semibold text-sheet transition-colors duration-step hover:bg-hazard/90"
    >
      Get your price
    </button>
  );
}

function detectReferrer(): 'sms' | 'direct' | 'other' {
  if (typeof document === 'undefined') return 'direct';
  const ref = document.referrer;
  if (!ref) return 'direct'; // no referrer header is exactly what an SMS tap produces
  try {
    const host = new URL(ref).hostname;
    if (host.includes('messages') || host.includes('sms')) return 'sms';
    return 'other';
  } catch {
    return 'other';
  }
}
