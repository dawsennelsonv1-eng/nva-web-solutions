import { ToolCard } from '@/components/site/ToolCard';
import { getQueueSections } from '@/lib/queue/data';
import { isVisualiserConfigured } from '@/lib/site/render-config';
import { mediaForTool } from '@/lib/tools/media';
import { PUBLIC_TOOLS, QUIET_REASON, pricerFor, tintFor } from '@/lib/tools/card-config';

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
 * PHASE 17D: the tints, swatches, pricer wiring, quiet reasons and the public
 * allowlist all moved to lib/tools/card-config, because the tool page now
 * mounts the same card. Two copies of a rate document is how one surface starts
 * pricing a job differently from another while both look correct.
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
  const mediaByTool = new Map(
    await Promise.all(
      live.map(async (row) => [row.tool.id, await mediaForTool(row.tool.id)] as const)
    )
  );

  const shown = live.filter((row) => PUBLIC_TOOLS.includes(row.tool.id));
  if (shown.length === 0) return null;

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

            return (
              <ToolCard
                key={row.tool.id}
                toolId={row.tool.id}
                trade={row.tool.trade}
                summary={row.tool.prices}
                unit={row.tool.unit}
                inService
                tint={tintFor(row.tool.id)}
                renderEnabled={renderEnabled}
                media={mediaByTool.get(row.tool.id) ?? []}
                specHref={`/tools/${row.tool.id}`}
                quietReason={QUIET_REASON[row.tool.id]}
                pricer={pricerFor(row.tool.id)}
              />
            );
          })}
        </div>

      </div>
    </section>
  );
}
