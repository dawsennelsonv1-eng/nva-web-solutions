import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getBuildMonths, getQueueSections } from '@/lib/queue/data';
import { TOOLS, getTool } from '@/lib/queue/tools';
import { QueueRow } from '@/components/queue/QueueRow';
import { BuildLog } from '@/components/queue/BuildLog';
import { Concierge, type ConciergeEntry } from '@/components/queue/Concierge';

/**
 * app/(public)/queue/page.tsx — THE BUILD QUEUE.
 *
 * Not a directory. A directory implies a catalogue you could buy from, and
 * seventeen unbuilt entries in a catalogue are seventeen lies. This is a
 * document about the order in which work happens, which a contractor runs one
 * of every week and will read as a schedule, because it is one.
 *
 * SCANNABLE IN TEN SECONDS. He is deciding whether I am real, not reading a
 * catalogue. Four headed sections, ordered rows, a Plate on every row, and the
 * weakness stated before he has to find it.
 *
 * THE DISCLOSURE IS COMPUTED, NOT WRITTEN. The counts in the paragraph below
 * come from the resolved sections, so they cannot go stale and cannot be
 * generous. If a module is deregistered tomorrow, the sentence corrects itself.
 */

export const metadata: Metadata = {
  title: 'Build queue',
  description:
    'Which tools exist, which are being built, and what decides the next one. One tool enters build per month, ordered by real votes.',
  openGraph: {
    title: 'Girder build queue',
    description:
      'Which tools exist, which are being built, and what decides the next one. Ordered by real votes.',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Girder build queue' }],
  },
  twitter: { card: 'summary_large_image' },
};

// Votes change this page, so it is rendered per request rather than cached.
export const dynamic = 'force-dynamic';

function Section({
  heading,
  blurb,
  rows,
  empty,
}: {
  heading: string;
  blurb: string;
  rows: ReactNode;
  empty?: string;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-lg font-semibold uppercase tracking-tight">{heading}</h2>
      <p className="mt-1 max-w-[60ch] text-sm text-rule">{blurb}</p>
      {empty ? (
        <p className="mt-3 max-w-[60ch] text-base">{empty}</p>
      ) : (
        <ul className="mt-3 border-t border-rule">{rows}</ul>
      )}
    </section>
  );
}

export default async function QueuePage() {
  const [sections, months] = await Promise.all([getQueueSections(), getBuildMonths()]);

  const built = sections.inService.length;
  const unbuilt = TOOLS.length - built;

  const index: ConciergeEntry[] = TOOLS.map((t) => ({
    id: t.id,
    name: t.name,
    trade: t.trade,
    built: sections.inService.some((r) => r.tool.id === t.id),
    keywords: t.keywords,
  }));

  return (
    <>
      <div className="bg-concrete px-4 pb-14 pt-8">
        <div className="mx-auto max-w-5xl">
          <h1 className="max-w-[16ch] font-display text-display font-extrabold uppercase">
            The order work happens in
          </h1>

          {/* THE DISCLOSURE. Voluntary admission of your own weakness is the one
              thing an agency would never do, and it is the strongest move
              available with a buyer who has been burned before. It goes above
              the list, not below it. */}
          <p className="mt-4 max-w-[62ch] text-base">
            {unbuilt} of the {TOOLS.length} tools on this page do not exist.{' '}
            {built === 1 ? 'One does' : `${built} do`}. Everything below says which it is, on its
            own plate, and none of it is a catalogue you can buy from today.
          </p>
          <p className="mt-3 max-w-[62ch] text-base">
            What decides the next one: whichever tool leads the queue on the 1st of the month
            enters build that month. One per month, not one per week — that is a pace holdable in
            a bad month, and a queue that stalls is worse than no queue at all.
          </p>

          {!sections.votesLoaded && (
            <p className="mt-3 max-w-[62ch] font-data text-2xs uppercase tracking-[0.08em] text-rule">
              Vote counts could not be read just now. Ranking below is incomplete.
            </p>
          )}

          <Section
            heading="In service"
            blurb="Built, deployed, running on live sites."
            rows={sections.inService.map((r) => <QueueRow key={r.tool.id} row={r} />)}
            empty={sections.inService.length === 0 ? 'Nothing is in service.' : undefined}
          />

          <Section
            heading="In build"
            blurb="One at a time, with the month it is expected in service."
            rows={sections.inBuild.map((r) => <QueueRow key={r.tool.id} row={r} />)}
            empty={
              sections.inBuild.length === 0
                ? 'Nothing is in build this month. The queue leader on the 1st takes the slot.'
                : undefined
            }
          />

          <Section
            heading="Queued"
            blurb="Ordered by real votes. A tool appears here the moment it has one."
            rows={sections.queued.map((r) => <QueueRow key={r.tool.id} row={r} />)}
            empty={
              sections.queued.length === 0
                ? 'Nothing has a vote yet. The first tool to get one appears here, ranked, and the section fills from there. No votes have been seeded to make this look busier.'
                : undefined
            }
          />

          <Section
            heading="Spec only"
            blurb="Specification written and published. Not built. Open one and check the maths."
            rows={sections.specOnly.map((r) => <QueueRow key={r.tool.id} row={r} />)}
            empty={sections.specOnly.length === 0 ? 'Nothing is unspecified.' : undefined}
          />

          {/* THE RECEIPTS. Empty until a month completes; the moment one row
              shows a tool that shipped because it won the vote, this page stops
              being a promise and becomes evidence. */}
          <section className="mt-10">
            <h2 className="font-display text-lg font-semibold uppercase tracking-tight">
              Previous months
            </h2>
            {months.length === 0 ? (
              <p className="mt-3 max-w-[60ch] text-base">
                No month has completed under this commitment yet. When one has, it appears here
                with the tool that took the slot and whether the vote put it there.
              </p>
            ) : (
              <ul className="mt-3 border-t border-rule">
                {months.map((m) => {
                  const tool = getTool(m.toolId);
                  return (
                    <li
                      key={m.month}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule py-3"
                    >
                      <span className="font-data text-xs tabular text-rule">{m.month}</span>
                      <span className="min-w-0 flex-1 text-base">{tool?.name ?? m.toolId}</span>
                      <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                        {m.shippedOn ? `Shipped ${m.shippedOn}` : 'In build'}
                        {m.wonByVote ? ' · won the vote' : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <BuildLog />
      <Concierge index={index} />
    </>
  );
}
