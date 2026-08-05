import Link from 'next/link';
import { Plate } from '@/components/ui/Plate';
import { MiniPricer } from '@/components/site/MiniPricer';
import { getQueueSections } from '@/lib/queue/data';
import { TOOLS } from '@/lib/queue/tools';
import { demoHrefFor } from '@/lib/queue/categories';
import {
  DEFAULT_TIER,
  REFERENCE_FINISHES,
  REFERENCE_RULES,
  REFERENCE_SQFT_MAX,
  REFERENCE_SQFT_MIN,
} from '@/lib/site/reference-rates';

/**
 * components/site/Showcase.tsx — THE TOOLS, AS THINGS YOU CAN TOUCH.
 *
 * ============================================================================
 * WHY THIS EXISTS ALONGSIDE THE QUEUE RATHER THAN INSTEAD OF IT
 * ============================================================================
 *
 * The build queue is the more honest artefact and it stays exactly as it is.
 * But it is a LIST, and a list does not stop a scroll. A visitor arriving from
 * a paid feed decides in under a second, and he decides on something he can
 * put his thumb on.
 *
 * So: the showcase is the thing you touch, the queue is the schedule. Neither
 * replaces the other and the strip at the bottom of this section says so in
 * plain words rather than burying the link.
 *
 * ============================================================================
 * WHAT MAY APPEAR AS INTERACTIVE — THE RULE, AND WHY IT COST A CARD
 * ============================================================================
 *
 * Only a tool that is IN SERVICE **and has a live surface** gets a pricer.
 * Those are two different conditions and today only one trade satisfies both.
 *
 * Painting is genuinely IN SERVICE: the module is registered, it prices a
 * repaint, and getQueueSections() confirms it against the registry rather than
 * taking the catalogue's word. Its Plate says IN SERVICE and that is true.
 *
 * What painting does not have is a rules document — the public analogue of one
 * contractor's quote_config, which for epoxy is lib/site/reference-rates.ts
 * and is mirrored line by line from a seeded config that the pricing test
 * suite asserts against. There is no equivalent for painting. Writing one
 * would mean inventing Dallas repaint rates, and an invented rate on this page
 * is the exact failure every other honesty mechanism in this codebase — the
 * Plate's required fields, the registry reconciliation, metrics returning null
 * — was built to prevent. A fabricated number does not become acceptable
 * because it is in the most-viewed component.
 *
 * So painting gets a truthful card with no pricer and a stated reason. The day
 * a painting rules document exists this file gains one entry in LIVE_PRICERS
 * and the card becomes interactive with no other change.
 *
 * Two real cards would have been better. One real card and one honest card is
 * better than one real card and one fabricated one.
 */

/**
 * The pricer configuration for each tool that has one. Absence is meaningful:
 * a tool not in here renders as a card without a demo, whatever its status.
 */
const LIVE_PRICERS: Record<
  string,
  {
    verticalId: string;
    surfaceTypeId: string;
    defaultSqft: number;
    caption: string;
  }
> = {
  epoxy: {
    verticalId: 'epoxy',
    surfaceTypeId: 'garage',
    // A two-car garage — the middle typical dimension in the epoxy module.
    defaultSqft: 480,
    caption: 'Drag the rule. This is the live engine, running the published Dallas rates.',
  },
};

export async function Showcase() {
  const sections = await getQueueSections();
  const live = sections.inService;

  // Nothing is in service — render nothing rather than an empty shelf.
  if (live.length === 0) return null;

  const remaining = TOOLS.length - live.length;

  return (
    <section className="bg-concrete px-4 py-14" aria-labelledby="showcase-h">
      <div className="mx-auto max-w-5xl">
        <h2 id="showcase-h" className="font-display text-2xl font-extrabold uppercase">
          The tools that are running
        </h2>
        <p className="mt-2 max-w-[60ch] text-base">
          Every plate below is checked against the code at the moment you loaded this page. Where
          there is a rule to drag, the price is the real engine — no account, no photo, nothing
          recorded.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {live.map((row) => {
            const pricer = LIVE_PRICERS[row.tool.id];
            const demo = demoHrefFor(row.tool.id);

            return (
              <article
                key={row.tool.id}
                className="flex flex-col border border-rule bg-sheet p-4"
              >
                <Plate
                  unit={row.tool.unit}
                  status="IN SERVICE"
                  rev={row.tool.rev}
                  date={row.tool.date}
                  count={
                    row.deploys !== null
                      ? { label: 'Deploys', value: row.deploys }
                      : { label: 'Votes', value: row.votes }
                  }
                />

                <h3 className="mt-3 font-display text-lg font-extrabold uppercase leading-tight">
                  {row.tool.trade}
                </h3>
                <p className="mt-1 text-sm">{row.tool.prices}</p>

                {pricer ? (
                  <div className="mt-4">
                    <MiniPricer
                      verticalId={pricer.verticalId}
                      rules={REFERENCE_RULES}
                      finishes={REFERENCE_FINISHES.map((f) => ({
                        id: f.id,
                        label: f.label,
                        tierKey: f.tierKey,
                      }))}
                      sqftMin={REFERENCE_SQFT_MIN}
                      sqftMax={REFERENCE_SQFT_MAX}
                      defaultSqft={pricer.defaultSqft}
                      defaultTier={DEFAULT_TIER}
                      surfaceTypeId={pricer.surfaceTypeId}
                    />
                    <p className="mt-2 text-2xs text-rule">{pricer.caption}</p>
                  </div>
                ) : (
                  <p className="mt-4 border-t border-rule pt-3 text-sm text-rule">
                    The module prices this trade and the arithmetic is written down. There is no
                    live demo for it yet — the published rate document that a demo prices against
                    does not exist, and inventing one would put a number on this page that nobody
                    can check.
                  </p>
                )}

                {/* Two actions, and the hazard one is the only hazard fill in
                    this card. The secondary is an ink outline, per 13A 2.5. */}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Link
                    href="/pricing"
                    className="press flex-1 rounded-milled bg-hazard px-4 py-3 text-center font-body font-semibold text-sheet"
                  >
                    Install on my site
                  </Link>
                  <Link
                    href={demo ?? `/queue/${row.tool.id}`}
                    className="press flex-1 rounded-milled border border-ink bg-sheet px-4 py-3 text-center font-body font-semibold text-ink"
                  >
                    See how it prices
                  </Link>
                </div>
              </article>
            );
          })}
        </div>

        {/* THE STRIP. Labelled honestly, and the count is computed from the
            catalogue rather than typed — a number in this sentence that could
            drift from the queue page is a small lie waiting to happen. */}
        {remaining > 0 && (
          <div className="mt-6 border border-rule bg-sheet p-4">
            <p className="text-base">
              {remaining} more {remaining === 1 ? 'trade is' : 'trades are'} specified and queued —
              the inputs and the arithmetic are written down for every one of them, and they are
              built in the order contractors ask for them.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Link
                href="/queue"
                className="press rounded-milled border border-ink bg-sheet px-4 py-3 text-center font-body font-semibold text-ink"
              >
                See the schedule
              </Link>
              <Link
                href="/categories"
                className="press rounded-milled border border-ink bg-sheet px-4 py-3 text-center font-body font-semibold text-ink"
              >
                Check for tools in my niche
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
