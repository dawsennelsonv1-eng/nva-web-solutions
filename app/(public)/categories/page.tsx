import type { Metadata } from 'next';
import Link from 'next/link';
import { GradientField } from '@/components/site/GradientField';
import { getQueueSections, type QueueRow } from '@/lib/queue/data';
import { CATEGORIES, assertCategories, demoHrefFor } from '@/lib/queue/categories';

/**
 * app/(public)/categories/page.tsx — EVERY TRADE, GROUPED. Restyled, 16G.
 *
 * ============================================================================
 * WHY THIS PAGE HAD TO MOVE INTO THE NEW SYSTEM
 * ============================================================================
 *
 * It is linked from the header on every page and from the foot of the tool
 * deck, so it is one tap from the homepage. Until now it was still ink-on-white
 * in the old industrial language — square corners, hairline rules, 10px mono
 * plates — while everything around it had moved. Tapping "Categories" from a
 * page of tilting cards landed you in what looked like a different product.
 *
 * ============================================================================
 * THE LOGIC IS UNCHANGED. ALL OF IT.
 * ============================================================================
 *
 * Same getQueueSections() reconciliation, same demoHrefFor() routing, same
 * assertCategories() guard at module scope, same three destinations, same
 * stated reason when a live trade has no demo. Only the markup changed.
 *
 * That matters because the honesty properties of this page are load-bearing:
 * it is structurally incapable of showing an "in service" badge for a trade
 * whose module is not registered, and it says out loud when it cannot send a
 * painter to a demo rather than showing him a garage floor. None of that is
 * presentation and none of it was touched.
 *
 * ============================================================================
 * THE PLATE IS GONE FROM THIS PAGE, NOT FROM THE REPO
 * ============================================================================
 *
 * components/ui/Plate.tsx is untouched and still serves /queue and
 * /queue/[toolId]. It is simply not imported here any more: it is drawn in the
 * old token system and cannot be restyled without changing those pages too.
 *
 * What replaces it carries the same two facts — the status and the unit number
 * — in the pill the tool cards already use, so a visitor arriving from the
 * homepage recognises it. The revision and date it also carried are dropped
 * here on purpose: they are spec-sheet detail, and this page answers "is my
 * trade on here", not "what revision is it at".
 *
 * Server component. No client JavaScript. Nothing observes scroll.
 */

export const metadata: Metadata = {
  title: 'Trades',
  description:
    'Every trade this system prices, and every trade specced and queued. Find yours and see exactly what it would ask your customer.',
};

// Fails loudly at request time if a tool has been added to the catalogue and
// not to a category — unchanged from the original.
assertCategories();

export default async function CategoriesPage() {
  const sections = await getQueueSections();

  const byId = new Map<string, QueueRow>();
  for (const row of [
    ...sections.inService,
    ...sections.inBuild,
    ...sections.queued,
    ...sections.specOnly,
  ]) {
    byId.set(row.tool.id, row);
  }

  const liveCount = sections.inService.length;

  return (
    <>
      <GradientField />
      <section className="n15-sec" aria-labelledby="cats-h">
        <div className="n15-in">
          <p className="n15-eyebrow">Find your trade</p>
          <h1 id="cats-h" className="n15-h2">
            Is there a tool for what you do?
          </h1>
          <p className="n15-lede">
            {liveCount === 1
              ? 'One trade is in service and can be priced today.'
              : `${liveCount} trades are in service and can be priced today.`}{' '}
            The rest are specified — the inputs and the arithmetic are written
            down and you can read them — and they are built in the order
            contractors ask for them.
          </p>
          <p className="n15-small n15-measure">
            Every status below is the real state of that module, checked against
            the code at the moment you loaded this page. Nothing here is
            aspirational.
          </p>

          {CATEGORIES.map((cat) => (
            <section key={cat.id} className="cat-group" aria-labelledby={`cat-${cat.id}`}>
              <h2 id={`cat-${cat.id}`} className="n15-h3">
                {cat.label}
              </h2>
              <p className="n15-small cat-blurb">{cat.blurb}</p>

              <ul className="cat-grid">
                {cat.toolIds.map((id) => {
                  const row = byId.get(id);
                  if (!row) return null;

                  const live = row.status === 'IN SERVICE';
                  const demo = live ? demoHrefFor(id) : null;
                  const href = demo ?? `/queue/${id}`;

                  return (
                    <li key={id}>
                      <Link href={href} className={'cat-card' + (live ? ' cat-card-live' : '')}>
                        <span className="tc-status cat-status">
                          <span aria-hidden className="tc-dot" />
                          {row.status}
                          <span className="tc-unit">· {row.tool.unit}</span>
                        </span>

                        <span className="cat-trade">{row.tool.trade}</span>
                        <span className="cat-prices">{row.tool.prices}</span>

                        <span className="cat-go">
                          {demo
                            ? 'Price a job now →'
                            : live
                              ? 'In service — read the spec →'
                              : 'Read the spec and the math →'}
                        </span>

                        {live && !demo && (
                          <span className="cat-note">
                            The module prices this trade. There is no public demo
                            for it yet, and sending you to the epoxy one would
                            show you the wrong arithmetic.
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <div className="ai-foot">
            <p className="n15-body">
              Not here? The build queue takes your trade and your city, and that
              is what decides which one enters build next.
            </p>
            <div className="tc-actions n15-actions-wide">
              <Link href="/queue" className="n15-btn n15-btn-primary">
                Check the build queue
              </Link>
              <Link href="/#problem-h" className="n15-btn n15-btn-ghost">
                Tell us what is broken instead
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
