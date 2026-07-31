'use client';

import { useEffect, useRef } from 'react';
import { m } from '@/lib/motion';
import { formatCentsWhole } from '@/lib/quote/pricing';
import { CtaButton } from '@/components/marketing/CtaButton';
import { track } from '@/lib/analytics.client';
import type { SplitScreenPayload } from '@/app/actions/lead';
import type { Surface } from '@/types';

/**
 * components/demo/PayloadScreen.tsx — THE AHA MOMENT.
 *
 * SIDE A is the visitor's own submission, rendered as the literal
 * notification they'd receive — not a summary of it, the thing itself,
 * timestamped. SIDE B is a simulated homeowner lead, generated once,
 * server-side, deterministically per session (lib/demo/mockLead.ts) — never
 * re-rolled on a re-render.
 *
 * "MUST LOOK LIKE A REAL OPERATIONS DASHBOARD, NOT A MOCKUP": Side B borrows
 * the admin chrome's own visual vocabulary — Panel-style bordered blocks,
 * font-data labels, tabular figures — rather than marketing-site styling.
 * The one honesty concession: a small "SIMULATED" tag on Side B, because a
 * demo that could be mistaken for real customer data is a worse trust
 * failure than a slightly less seamless illusion.
 *
 * AT 360px THIS IS NOT A LITERAL SIDE-BY-SIDE: two columns of real content
 * do not fit a phone screen without either one becoming unreadable. Below
 * the `sm` breakpoint this stacks A above B, connected by a single motion
 * beat (the arrow-down transition) that reads as "and THIS is what happens
 * next," which is closer to the actual causal story than a cramped two-up
 * ever was.
 *
 * "The transition into this screen is an orchestrated moment. Land it": the
 * calling component (DemoExperience.tsx) wraps the swap from widget to this
 * screen in AnimatePresence; here, Side A appears first, then Side B beats
 * in half a step later, so the eye is led through the causal order (you
 * submitted -> here's what a real one does) rather than both halves
 * appearing as one flat block.
 */

export function PayloadScreen({
  payload,
  surface,
  onPurchaseClick,
}: {
  payload: SplitScreenPayload;
  surface: Surface;
  onPurchaseClick: () => void;
}) {
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    const t0 = performance.now();
    requestAnimationFrame(() => {
      track('payload_screen_viewed', { time_to_render_ms: Math.round(performance.now() - t0) }, { surface, mode: 'live' });
    });
    track('purchase_cta_viewed', { source_surface: surface }, { surface, mode: 'live' });
  }, [surface]);

  const explored = (action: 'accept' | 'call' | 'schedule') =>
    track('payload_side_b_explored', { action }, { surface, mode: 'live' });

  const { sideA, sideB } = payload;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}>
        <p className="font-data text-xs uppercase tracking-wide text-cure">Sent — this is how fast it moves</p>
        <h2 className="mt-1 font-display font-condensed text-2xl font-bold sm:text-3xl">
          This is how fast you and your homeowner get the quote.
        </h2>
      </m.div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* SIDE A — the real submission, rendered as the actual notification */}
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
          className="rounded-milled border border-ink bg-sheet p-4"
        >
          <p className="font-data text-xs uppercase tracking-wide text-rule">Your notification</p>
          <p className="mt-1 font-data text-[10px] text-rule">
            {new Date(sideA.submittedAt).toLocaleTimeString('en-US')}
          </p>
          <div className="mt-3 rounded-milled border bg-concrete p-3">
            <p className="text-base leading-snug">{sideA.notificationPreview}</p>
          </div>
          <dl className="mt-3 space-y-1 font-data text-sm">
            <div className="flex justify-between"><dt className="text-rule">Name</dt><dd>{sideA.name}</dd></div>
            <div className="flex justify-between"><dt className="text-rule">Phone</dt><dd>{sideA.phone}</dd></div>
            <div className="flex justify-between"><dt className="text-rule">Timeline</dt><dd>{sideA.timeline}</dd></div>
          </dl>
        </m.div>

        {/* SIDE B — the simulated homeowner lead, dashboard-styled */}
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.14 }}
          className="rounded-milled border bg-sheet p-4"
        >
          <div className="flex items-center justify-between">
            <p className="font-data text-xs uppercase tracking-wide text-rule">A real homeowner lead looks like this</p>
            <span className="rounded-milled border border-rule px-1.5 py-0.5 font-data text-[9px] uppercase tracking-wide text-rule">
              Simulated
            </span>
          </div>
          <p className="mt-1 font-data text-[10px] text-rule">Arrived {sideB.arrivedLabel}</p>

          <div className="mt-3 flex gap-3">
            <div
              aria-hidden
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-milled border border-rule bg-concrete bg-[repeating-linear-gradient(45deg,rgb(var(--c-rule)/0.25)_0,rgb(var(--c-rule)/0.25)_1px,transparent_1px,transparent_7px)]"
            >
              <span className="px-1 text-center font-data text-[8px] uppercase leading-tight text-rule">
                Simulated photo
              </span>
            </div>
            <div className="flex-1">
              <p className="font-display font-condensed text-base font-bold">{sideB.displayName}</p>
              <p className="font-data text-xs text-rule">{sideB.photoDescriptor}</p>
              <p className="mt-1 font-data text-xs">
                {sideB.finishLabel} — {sideB.colourLabel}
                <span
                  aria-hidden
                  className="ml-1.5 inline-block h-2.5 w-2.5 rounded-full border border-rule align-middle"
                  style={{ backgroundColor: sideB.colourHex }}
                />
              </p>
            </div>
          </div>

          <div className="tabular mt-3 flex items-baseline justify-between border-t pt-2">
            <span className="font-data text-xs text-rule">{sideB.sqft.toLocaleString('en-US')} sq ft</span>
            <span className="font-display font-condensed text-lg font-bold">
              {formatCentsWhole(sideB.computation.lowCents)}–{formatCentsWhole(sideB.computation.highCents)}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => explored('accept')}
              className="min-h-[2.5rem] rounded-milled bg-cure/15 px-2 font-data text-xs font-semibold text-cure"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => explored('call')}
              className="min-h-[2.5rem] rounded-milled border border-rule px-2 font-data text-xs font-semibold"
            >
              Call
            </button>
            <button
              type="button"
              onClick={() => explored('schedule')}
              className="min-h-[2.5rem] rounded-milled border border-rule px-2 font-data text-xs font-semibold"
            >
              Schedule
            </button>
          </div>
        </m.div>
      </div>

      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.24, delay: 0.28 }}
        className="mt-8 rounded-milled border border-hazard/30 bg-hazard/5 p-5 text-center"
      >
        <p className="font-display font-condensed text-lg font-bold">Want this on your own site?</p>
        <p className="mt-1 text-base text-rule">$500 to set up, $250 a month. Founding rate, for now.</p>
        <div className="mt-4 flex justify-center">
          <CtaButton
            glow
            onClick={() => {
              track('purchase_cta_clicked', { source_surface: surface, plan_code: 'foundation' }, { surface, mode: 'live' });
              onPurchaseClick();
            }}
          >
            Get started — $500
          </CtaButton>
        </div>
      </m.div>
    </div>
  );
}
