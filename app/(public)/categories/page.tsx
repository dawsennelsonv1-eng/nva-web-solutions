import type { Metadata } from 'next';
import Link from 'next/link';
import { Plate } from '@/components/ui/Plate';
import { getQueueSections, type QueueRow } from '@/lib/queue/data';
import { CATEGORIES, assertCategories, demoHrefFor } from '@/lib/queue/categories';

/**
 * app/(public)/categories/page.tsx — EVERY TRADE, GROUPED.
 *
 * The build queue is a schedule: it answers "when". This answers "whether",
 * which is the question a visitor actually arrives with. He does not want to
 * read nineteen rows in build order to discover that gutters are on the list.
 * He wants to find the word "Gutters" and tap it.
 *
 * STATUS COMES FROM getQueueSections(), NOT FROM THE CATALOGUE. That function
 * reconciles every declared status against the vertical registry — a trade
 * that claims to be in service but whose module is not registered is demoted
 * before it reaches this page. So this route is structurally incapable of
 * showing a green Plate for a trade that cannot actually be priced, and it
 * inherits that property rather than reimplementing it.
 *
 * WHERE A CARD GOES:
 *   IN SERVICE with a demo surface  -> the live demo
 *   IN SERVICE without one          -> its spec sheet, with the reason stated
 *   everything else                 -> its spec sheet
 *
 * The middle case is real today. See demoHrefFor() in lib/queue/categories.ts:
 * painting is registered and therefore genuinely IN SERVICE, but /demo is
 * hardwired to epoxy, so a painter sent there would be shown a garage floor.
 * Saying "no public demo yet" is a small admission. Showing him the wrong
 * trade's arithmetic under his own trade's name would end the visit.
 *
 * NOTHING ON THIS PAGE OBSERVES SCROLL, and nothing animates except the 70ms
 * press state on the cards.
 */

export const metadata: Metadata = {
  title: 'Trades',
  description:
    'Every trade this system prices, and every trade specced and queued. Find yours and see exactly what it would ask your customer.',
};

// Fails loudly at request time if a tool has been added to the catalogue and
// not to a category — see the note on assertCategories().
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
    <div className="px-4 pb-16 pt-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="max-w-[20ch] font-display text-display font-extrabold uppercase">
          Find your trade
        </h1>
        <p className="mt-3 max-w-[60ch] text-base">
          {liveCount === 1
            ? 'One trade is in service and can be priced today.'
            : `${liveCount} trades are in service and can be priced today.`}{' '}
          The rest are specified — the inputs and the arithmetic are written down and you can read
          them — and they are built in the order contractors ask for them.
        </p>
        <p className="mt-2 max-w-[60ch] text-sm text-rule">
          Every plate below is the real status of that module, checked against the code at the
          moment you loaded this page. Nothing here is aspirational.
        </p>

        {CATEGORIES.map((cat) => (
          <section key={cat.id} className="mt-10" aria-labelledby={`cat-${cat.id}`}>
            <h2
              id={`cat-${cat.id}`}
              className="font-display text-2xl font-extrabold uppercase"
            >
              {cat.label}
            </h2>
            <p className="mt-1 max-w-[60ch] text-sm text-rule">{cat.blurb}</p>

            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {cat.toolIds.map((id) => {
                const row = byId.get(id);
                if (!row) return null;

                const live = row.status === 'IN SERVICE';
                const demo = live ? demoHrefFor(id) : null;
                const href = demo ?? `/queue/${id}`;

                return (
                  <li key={id}>
                    <Link
                      href={href}
                      className="press block h-full border border-rule bg-sheet p-4"
                    >
                      <Plate
                        unit={row.tool.unit}
                        status={row.status === 'QUEUED' ? 'QUEUED' : row.status}
                        rev={row.tool.rev}
                        date={row.tool.date}
                        count={
                          row.deploys !== null
                            ? { label: 'Deploys', value: row.deploys }
                            : { label: 'Votes', value: row.votes }
                        }
                      />

                      <p className="mt-3 font-display text-lg font-extrabold uppercase leading-tight">
                        {row.tool.trade}
                      </p>
                      <p className="mt-1 text-sm">{row.tool.prices}</p>

                      <p className="mt-3 font-data text-2xs uppercase tracking-[0.08em] text-hazard">
                        {demo
                          ? 'Price a job now →'
                          : live
                            ? 'In service — read the spec →'
                            : 'Read the spec and the math →'}
                      </p>

                      {live && !demo && (
                        <p className="mt-1 text-2xs text-rule">
                          The module prices this trade. There is no public demo for it yet, and
                          sending you to the epoxy one would show you the wrong arithmetic.
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <div className="mt-12 border-t border-rule pt-6">
          <p className="max-w-[60ch] text-base">
            Not here? The build queue takes your trade and your city, and that is what decides
            which one enters build next.
          </p>
          <Link
            href="/queue"
            className="press mt-3 inline-block rounded-milled bg-hazard px-4 py-3 font-body font-semibold text-sheet"
          >
            Check for tools in my niche
          </Link>
        </div>
      </div>
    </div>
  );
}
