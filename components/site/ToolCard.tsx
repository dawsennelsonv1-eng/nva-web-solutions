'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AreaRule } from '@/components/site/AreaRule';
import { FinishVisualiser } from '@/components/site/FinishVisualiser';
import { calculateQuote, type PricingRules } from '@/lib/quote/pricing';
import { finishPhotoFor } from '@/lib/site/finish-photos';

/**
 * components/site/ToolCard.tsx — THE CENTREPIECE.
 *
 * A card is a physical object: it sits on its own drifting gradient, it tilts
 * toward a finger, it lifts when pressed, and everything a visitor can do to
 * it happens inline. Nothing on this card navigates away.
 *
 * ============================================================================
 * WHAT COSTS MONEY AND WHAT DOES NOT — THE GUARANTEE IS STRUCTURAL
 * ============================================================================
 *
 * FREE, and free because there is no code path that could spend anything:
 * dragging the area rule, choosing a finish, the price recomputing, tilting
 * the card, and expanding it. `calculateQuote` is imported and called in the
 * browser. There is no fetch, no server action, and no analytics call on any
 * of those interactions. This is the same property MiniPricer had and it is
 * kept for the same reason — a flag can be dropped by a refactor, an absent
 * code path cannot.
 *
 * COSTS MONEY: sending a photo, and only that. One render, guarded by the per-
 * IP limit, the payload validator and the daily ceiling, in that order, before
 * a byte reaches a provider.
 *
 * NOTE ON ANALYTICS: this card deliberately emits none. lib/analytics.ts types
 * `EventName` as a closed union and that file was not in scope for this phase,
 * so inventing an event name here would be a type error on first push. Adding
 * instrumentation is a one-line change once that union is in front of you.
 *
 * ============================================================================
 * TILT, AND THE 60FPS BUDGET
 * ============================================================================
 *
 * The tilt writes two CSS variables on this card's own element inside a rAF,
 * one write per frame, and the card's transform reads them. It is compositor
 * work and it never triggers layout.
 *
 * Only ONE card can be under a pointer at a time, so the tilt cost does not
 * multiply with the deck. The ambient gradient does, which is why it is a
 * single animated layer per card rather than the three the site field runs.
 *
 * THERE IS NO OFF-SCREEN PAUSE, and that is a corrected decision rather than an
 * omission. The first version of this file used an IntersectionObserver to stop
 * a card's gradient once it left the viewport. The repo's ESLint config bans
 * IntersectionObserver outright under 13A build constraint 4 — no scroll-
 * triggered animation of any kind — and the build failed on it.
 *
 * The rule is right and the exception was not worth taking. It reads intent
 * from the API rather than from a comment, which is the only way a constraint
 * like that survives contact with a future phase, and what the observer bought
 * on a two-card deck was one composited layer. Cards still stop animating when
 * the TAB is hidden: GradientField toggles .tab-hidden on <html> and the CSS
 * pauses .tc-field with it, which is the case that actually drains a battery.
 *
 * If the deck ever grows past four or five live tools and the gradients start
 * costing something measurable, the fix is CSS — content-visibility: auto with
 * a contain-intrinsic-size on the card — not a scroll observer.
 *
 * `will-change: transform` is added only while a card is actually tilting and
 * removed when the pointer leaves. Leaving it on would promote every card to a
 * permanent compositor layer, which is a memory cost paid by the mid-range
 * device the page is built for.
 *
 * Reduced motion: the effect never attaches, so the card is static and the
 * variables stay at zero. The CSS also drops the transform outright.
 */

/** How far a card leans, in degrees, at the far edge. Past ~7 it reads as a
 *  broken layout rather than as an object catching the light. */
const MAX_TILT_DEG = 6;

export interface ToolCardFinish {
  id: string;
  label: string;
  tierKey: string;
  /** From the vertical's colour deck. Paints the swatch when no photo exists. */
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
  /** The two gradient stops that make this card distinct. */
  tint: { a: string; b: string; durationSeconds: number };
  /** Absent when the tool has no published rate document — see ToolDeck. */
  pricer: ToolCardPricer | null;
  /** Printed instead of the controls when `pricer` is null. Must be true. */
  quietReason?: string;
  /** Server-computed: is the render path configured at all? */
  renderEnabled: boolean;
  /** Where a tool that is not interactive sends people. */
  specHref: string;
}

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
}: ToolCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const [pressed, setPressed] = useState(false);

  const [sqft, setSqft] = useState(pricer?.defaultSqft ?? 0);
  const [tierKey, setTierKey] = useState(pricer?.defaultTier ?? '');

  /** Stable for the life of the mount. Correlates a render to a visit without
   *  identifying anybody — it is a random string, not a fingerprint. */
  const sessionId = useMemo(
    () => 'home-' + toolId + '-' + Math.random().toString(36).slice(2, 10),
    [toolId]
  );

  // ---- tilt ---------------------------------------------------------------
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
      // Dropped one frame later so the card is not de-promoted mid-return.
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

  // ---- the price, computed in the browser ---------------------------------
  const band = useMemo(() => {
    if (!pricer) return null;
    try {
      const q = calculateQuote(
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
      return { lowCents: q.lowCents, highCents: q.highCents };
    } catch {
      // A rules document the kernel rejects must not kill the card. The card
      // keeps its photography, its copy and its links; only the number goes.
      return null;
    }
  }, [pricer, sqft, tierKey]);

  const selectedFinish = pricer?.finishes.find((f) => f.tierKey === tierKey);

  const onDragState = useCallback((dragging: boolean) => setPressed(dragging), []);

  const style = {
    '--tc-1': tint.a,
    '--tc-2': tint.b,
    '--tc-dur': tint.durationSeconds + 's',
  } as CSSProperties;

  return (
    <article
      ref={cardRef}
      className={
        'tc' + (pressed ? ' tc-press' : '') + (pricer ? '' : ' tc-quiet')
      }
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
            <span style={{ opacity: 0.5 }}>· {unit}</span>
          </span>
        </header>

        {pricer ? (
          <>
            <div className="tc-panel">
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

              <div className="tc-finishes">
                {pricer.finishes.map((f) => {
                  const on = f.tierKey === tierKey;
                  const photo = finishPhotoFor(pricer.verticalId, f.tierKey);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className="tc-fin"
                      aria-pressed={on}
                      onClick={() => setTierKey(f.tierKey)}
                    >
                      <span
                        className="tc-fin-img"
                        style={{ '--fin-hex': f.swatchHex ?? '#2a2f37' } as CSSProperties}
                      >
                        {photo ? (
                          <FinishThumb src={photo.src} alt={photo.alt} />
                        ) : (
                          <span aria-hidden className="tc-fin-ph" />
                        )}
                      </span>
                      {/* The finish TYPE, always printed. An uncaptioned floor
                          photograph on this page reads as portfolio, and there
                          is no portfolio — see lib/site/finish-photos.ts. */}
                      <span className="tc-fin-name">{f.label}</span>
                    </button>
                  );
                })}
              </div>

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
                  Live arithmetic, published in full further down this page. No
                  account, no photo, nothing recorded.
                </p>
              </div>
            </div>

            <FinishVisualiser
              enabled={renderEnabled}
              finishLabel={selectedFinish?.label ?? 'the finish'}
              surfaceLabel={pricer.surfaceLabel}
              sessionId={sessionId}
            />

            <div className="tc-actions">
              <Link href="/pricing" className="n15-btn n15-btn-primary">
                Try it out
              </Link>
              <Link href={specHref} className="n15-btn n15-btn-ghost">
                What it costs to run
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="tc-reason">{quietReason}</p>
            <div className="tc-actions">
              <Link href={specHref} className="n15-btn n15-btn-ghost">
                Read the spec sheet
              </Link>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

/**
 * A finish photograph, with its absence as a designed state.
 *
 * Every file under /public/finishes is currently missing from the repo, so
 * this is not an edge case — it is what the page does today. A bare next/image
 * pointing at an absent file makes the optimizer 400 and the browser paint a
 * torn-page glyph, which would fill a PRICING CONTROL with error icons. On
 * failure it swaps to the tinted swatch instead, built from the finish's own
 * colour deck, and the control keeps working throughout because the photo was
 * never load-bearing for the interaction.
 *
 * Never `priority`: the LCP element on this page is the hero headline, and
 * three high-priority image requests would land in front of the display serif
 * on a 4G connection. These sit below the fold and load lazily, which is also
 * what holds the 1.5MB first-load budget.
 */
function FinishThumb({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span aria-hidden className="tc-fin-ph" />;
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="(min-width: 980px) 150px, 30vw"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
