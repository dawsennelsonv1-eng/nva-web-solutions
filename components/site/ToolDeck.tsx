import Link from 'next/link';
import { ToolCard, type ToolCardFinish } from '@/components/site/ToolCard';
import { getQueueSections } from '@/lib/queue/data';
import { TOOLS } from '@/lib/queue/tools';
import {
  DEFAULT_TIER,
  REFERENCE_FINISHES,
  REFERENCE_RULES,
  REFERENCE_SQFT_MAX,
  REFERENCE_SQFT_MIN,
} from '@/lib/site/reference-rates';

/**
 * components/site/ToolDeck.tsx — "The tools that are running."
 *
 * REPLACES components/site/Showcase.tsx as the homepage's tool section. The
 * old file is not edited and not deleted by this phase: I can only see files
 * pasted into it, and Showcase may be mounted somewhere I cannot see. It is
 * simply no longer imported by app/(public)/page.tsx. Grep for it before
 * removing it.
 *
 * ============================================================================
 * WHAT MAY APPEAR AS INTERACTIVE — THE RULE IS UNCHANGED AND IT STILL BINDS
 * ============================================================================
 *
 * Status is never taken from the catalogue. getQueueSections() reconciles it
 * against the vertical registry, which is the only thing in this codebase that
 * knows whether a trade can actually be priced. Both epoxy and painting are
 * registered in lib/verticals/manifest.ts, so both resolve to IN SERVICE even
 * though the catalogue still declares painting as IN BUILD.
 *
 * IN SERVICE and PRICEABLE ON THIS PAGE are still two different conditions.
 * A live pricer needs a published rate document — the public analogue of one
 * contractor's quote_config — and lib/site/reference-rates.ts is the only one
 * that exists. It is mirrored line by line from the epoxy config in seed.sql,
 * which the pricing test suite asserts against.
 *
 * There is no equivalent for painting. Writing one would mean inventing Dallas
 * repaint rates, and an invented rate on the most-viewed component on the site
 * is exactly the failure the Plate's required fields, the registry
 * reconciliation and metrics.ts returning null were all built to prevent. So
 * painting gets a card with no controls and a stated reason.
 *
 * The day a painting rate document exists, this file gains one entry in
 * PRICERS and that card becomes interactive with no other change.
 *
 * ============================================================================
 * THE RENDER SWITCH IS READ HERE, ON THE SERVER
 * ============================================================================
 *
 * lib/ai/images returns 'not_configured' when OPENROUTER_API_KEY is absent, so
 * on a deployment without the key every upload would fail politely after a
 * round trip. Reading it here lets the card render the invitation visibly
 * inert with a plain note instead of shipping a button that always fails.
 *
 * process.env is read in a server component, so the key itself never reaches
 * the browser — only the boolean does.
 */

/**
 * Per-card gradient stops. Distinct per tool so the cards feel individually
 * alive, and drawn from the 15A palette rather than from a new one: copper and
 * steel for the resin trade, teal and steel for the coatings trade. The
 * durations are deliberately coprime-ish so two cards on a wide screen do not
 * visibly pulse in lockstep.
 */
const TINTS: Record<string, { a: string; b: string; durationSeconds: number }> = {
  epoxy: {
    a: 'rgba(201, 112, 47, 0.34)',
    b: 'rgba(38, 72, 112, 0.30)',
    durationSeconds: 34,
  },
  painting: {
    a: 'rgba(22, 84, 70, 0.30)',
    b: 'rgba(38, 72, 112, 0.26)',
    durationSeconds: 41,
  },
};

const DEFAULT_TINT = {
  a: 'rgba(38, 72, 112, 0.28)',
  b: 'rgba(22, 84, 70, 0.24)',
  durationSeconds: 37,
};

/**
 * Swatch colours for the finish chips, used ONLY when the photograph for that
 * finish is missing — which is currently all of them.
 *
 * VERIFY: these three are read off the epoxy module's own colour deck
 * (lib/verticals/epoxy) — Tuxedo from Flake Blends, Copper Burl from Metallic
 * Pours, Charcoal from Solid Colours. They are a representative colour of the
 * family, not a claim that a specific product matches this hex on screen. The
 * chip is captioned with the finish type in words either way, so the swatch is
 * never the only thing telling a visitor what he is choosing.
 */
const SWATCH: Record<string, string> = {
  flake: '#3B3B3F',
  metallic: '#9C5B33',
  solid_polyaspartic: '#4A4D50',
};

/** Tools with a published rate document. Absence is meaningful. */
const PRICERS: Record<
  string,
  {
    verticalId: string;
    surfaceTypeId: string;
    surfaceLabel: string;
    defaultSqft: number;
  }
> = {
  epoxy: {
    verticalId: 'epoxy',
    surfaceTypeId: 'garage',
    surfaceLabel: 'garage',
    // A two-car garage — the middle typical dimension in the epoxy module.
    defaultSqft: 480,
  },
};

const QUIET_REASON: Record<string, string> = {
  painting:
    'The module prices this trade and the arithmetic is written down. There is no live demo on this page yet, because the published rate document a demo prices against does not exist for painting — and inventing Dallas repaint rates to fill this space would put a number here that nobody can check.',
};

export async function ToolDeck() {
  const sections = await getQueueSections();
  const live = sections.inService;

  // Nothing is in service: render nothing rather than an empty shelf.
  if (live.length === 0) return null;

  const renderEnabled = Boolean(process.env.OPENROUTER_API_KEY);
  const remaining = TOOLS.length - live.length;

  const finishes: ToolCardFinish[] = REFERENCE_FINISHES.map((f) => ({
    id: f.id,
    label: f.label,
    tierKey: f.tierKey,
    swatchHex: SWATCH[f.tierKey],
  }));

  return (
    <section className="n15-sec" aria-labelledby="tools-h">
      <div className="n15-in">
        <p className="n15-eyebrow">The tools that are running</p>
        <h2 id="tools-h" className="n15-h2">
          Drag it. That is the real price.
        </h2>
        <p className="n15-lede">
          Every status below is checked against the code at the moment you loaded
          this page. Where there is a rule to drag, the number moving under your
          thumb is the same engine your customers would use.
        </p>

        <div className="tc-deck">
          {live.map((row) => {
            const spec = PRICERS[row.tool.id];
            const tint = TINTS[row.tool.id] ?? DEFAULT_TINT;

            return (
              <ToolCard
                key={row.tool.id}
                toolId={row.tool.id}
                trade={row.tool.trade}
                summary={row.tool.prices}
                unit={row.tool.unit}
                inService
                tint={tint}
                renderEnabled={renderEnabled}
                specHref={`/queue/${row.tool.id}`}
                quietReason={QUIET_REASON[row.tool.id]}
                pricer={
                  spec
                    ? {
                        verticalId: spec.verticalId,
                        surfaceTypeId: spec.surfaceTypeId,
                        surfaceLabel: spec.surfaceLabel,
                        rules: REFERENCE_RULES,
                        finishes,
                        sqftMin: REFERENCE_SQFT_MIN,
                        sqftMax: REFERENCE_SQFT_MAX,
                        defaultSqft: spec.defaultSqft,
                        defaultTier: DEFAULT_TIER,
                      }
                    : null
                }
              />
            );
          })}
        </div>

        {/* The count is computed from the catalogue rather than typed. A number
            in this sentence that could drift from the queue page is a small lie
            waiting to happen. */}
        {remaining > 0 && (
          <div className="ai-foot">
            <p className="n15-body">
              {remaining} more {remaining === 1 ? 'trade is' : 'trades are'}{' '}
              specified and queued. The inputs and the arithmetic are written down
              for every one of them, and they are built in the order contractors
              ask for them.
            </p>
            <div className="tc-actions">
              <Link href="/queue" className="n15-btn n15-btn-ghost">
                See the schedule
              </Link>
              <Link href="/categories" className="n15-btn n15-btn-ghost">
                Check for tools in my trade
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
