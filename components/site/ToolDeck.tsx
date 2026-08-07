import { ToolCard, type ToolCardFinish } from '@/components/site/ToolCard';
import { getQueueSections } from '@/lib/queue/data';
import { isVisualiserConfigured } from '@/lib/site/render-config';
import { mediaForTool } from '@/lib/tools/media';
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
 * round trip. Asking here lets the card render the invitation visibly inert
 * with a plain note instead of shipping a button that always fails.
 *
 * The env var is NOT read in this file. CONVENTIONS.md §4 forbids a component
 * reading one directly, so the question is asked of lib/site/render-config,
 * which is 'server-only'. The boolean crosses to the client as a prop; the key
 * never does.
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
    'The module prices this trade and the arithmetic is written down. There is no live demo on this page yet, because the published rate document a demo prices against does not exist for painting.',
};

/**
 * ============================================================================
 * THE PUBLIC ALLOWLIST — READ THIS BEFORE CHANGING IT
 * ============================================================================
 *
 * ONLY the tool ids in this array are shown to visitors. Everything else in the
 * catalogue is built, registered, reconciled and fully wired — it is simply not
 * rendered yet.
 *
 * WHY AN ALLOWLIST AND NOT A DELETION. Painting is registered in
 * lib/verticals/manifest.ts, it has a working module with a state machine and a
 * widget, and getQueueSections() correctly reports it as IN SERVICE. What it
 * does not have is a published rate document, so its card had no live pricer
 * and read as a half-finished thing on the most important page of the site.
 *
 * Hiding it is a PRESENTATION decision, reversed by adding one string here.
 * None of the painting code is deleted, disabled, or commented out. If you are
 * an AI reading this repo in a later session and wondering where painting went:
 * it is complete, it is in lib/verticals/painting/, and it is hidden ONLY by
 * this array. Add 'painting' below and it returns instantly, though it will
 * return as a quiet card until lib/site/reference-rates gains a painting rate
 * document and ToolDeck's PRICERS gains a matching entry.
 *
 * The same applies to every other trade in lib/queue/tools.ts. Nineteen are
 * specified; one is shown.
 * ============================================================================
 */
const PUBLIC_TOOLS: readonly string[] = ['epoxy'];

/*
 * VERIFY: app/(public)/tools/[toolId]/page.tsx holds its own copy of this list.
 * lib/queue is a data layer and "what is public" is a presentation decision, so
 * the two are deliberately not shared yet — but they MUST agree. When a third
 * surface needs it, lift it into lib/site/ and import it in all three.
 */

export async function ToolDeck() {
  const sections = await getQueueSections();
  const live = sections.inService;

  // Nothing is in service: render nothing rather than an empty shelf.
  if (live.length === 0) return null;

  const renderEnabled = isVisualiserConfigured();

  // Filtered AFTER the registry reconciliation, never instead of it. A tool
  // still has to genuinely be in service to reach this line; the allowlist only
  // decides whether an in-service tool is shown yet.
  const shown = live.filter((row) => PUBLIC_TOOLS.includes(row.tool.id));
  if (shown.length === 0) return null;

  /**
   * Recordings for every visible tool, fetched once here rather than per card.
   * mediaForTool is async-shaped against the day it becomes a table query
   * (see lib/tools/media.ts) — resolving them together keeps that a single
   * round trip instead of one per card.
   */
  const mediaByTool = new Map(
    await Promise.all(
      shown.map(async (row) => [row.tool.id, await mediaForTool(row.tool.id)] as const)
    )
  );

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
          this page. What you can touch here is the real thing your customers
          would use — not a video of it.
        </p>

        <div className="tc-deck">
          {shown.map((row) => {
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
                media={mediaByTool.get(row.tool.id) ?? []}
                specHref={`/tools/${row.tool.id}`}
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

      </div>
    </section>
  );
}
