import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { GradientField } from '@/components/site/GradientField';
import { getBuildMonths, getQueueSections } from '@/lib/queue/data';
import { TOOLS, getTool } from '@/lib/queue/tools';
import { QueueRow } from '@/components/queue/QueueRow';
import { BuildLog } from '@/components/queue/BuildLog';
import { Concierge, type ConciergeEntry } from '@/components/queue/Concierge';

/**
 * app/(public)/queue/page.tsx — THE BUILD QUEUE. Restyled, 16H.
 *
 * Not a directory. A directory implies a catalogue you could buy from, and
 * seventeen unbuilt entries in a catalogue are seventeen lies. This is a
 * document about the order in which work happens.
 *
 * SCANNABLE IN TEN SECONDS. He is deciding whether I am real. Four headed
 * sections, ordered rows, a status on every row, and the weakness stated before
 * he has to find it.
 *
 * ============================================================================
 * EVERY COMPUTED FIGURE IS STILL COMPUTED
 * ============================================================================
 *
 * The counts in the disclosure come from the resolved sections, so they cannot
 * go stale and cannot be generous. If a module is deregistered tomorrow the
 * sentence corrects itself. force-dynamic stays, because votes change the order.
 *
 * The `votesLoaded` warning stays too. A ranking rendered from a failed vote
 * read looks identical to a real one, so the page says so rather than quietly
 * showing a wrong order.
 *
 * ============================================================================
 * THE .bg-concrete WRAPPER IS GONE
 * ============================================================================
 *
 * It existed because these sections were ink-on-white and would have vanished
 * against the field. They are restyled now, so the wrapper is removed and the
 * gradient runs behind the whole document — the same seam closure the homepage
 * got in 16A.
 *
 * ============================================================================
 * CONCIERGE IS STILL LEGACY-STYLED — READ THIS
 * ============================================================================
 *
 * It is mounted unchanged at the foot of this page and is drawn in the old token
 * system. It is a client component with a search index and a form, so restyling
 * it is a rewrite rather than a class swap, and doing it in the same pass as
 * this page would have meant rushing both.
 *
 * It sits BELOW BuildLog, which paints its own darker band, so the register has
 * already changed by the time the reader reaches it — the seam is at the very
 * bottom of the page rather than in the middle of it. That is a mitigation, not
 * a fix.
 *
 * CONTINUE-POINT: components/queue/Concierge.tsx, then
 * components/queue/VoteForm.tsx, then app/(public)/queue/[toolId]/page.tsx —
 * which depends on both and on components/ui/Plate.tsx.
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
  // `| undefined` explicitly, so this is also correct under
  // exactOptionalPropertyTypes if that flag is ever switched on.
  empty?: string | undefined;
}) {
  return (
    <section className="q-sec">
      <h2 className="n15-h3">{heading}</h2>
      <p className="n15-small q-blurb">{blurb}</p>
      {empty ? <p className="n15-body q-empty">{empty}</p> : <ul className="q-list">{rows}</ul>}
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
      <GradientField />

      <section className="n15-sec" aria-labelledby="queue-h">
        <div className="n15-in">
          <p className="n15-eyebrow">The schedule</p>
          <h1 id="queue-h" className="n15-h2">
            The order work happens in
          </h1>

          {/* THE DISCLOSURE. Voluntary admission of your own weakness is the one
              thing an agency would never do, and it is the strongest move
              available with a buyer who has been burned before. It goes ABOVE
              the list, not below it. */}
          <p className="n15-lede">
            {unbuilt} of the {TOOLS.length} tools on this page do not exist.{' '}
            {built === 1 ? 'One does' : `${built} do`}. Everything below says which
            it is, and none of it is a catalogue you can buy from today.
          </p>
          <p className="n15-body n15-measure">
            What decides the next one: whichever tool leads the queue on the 1st
            of the month enters build that month. One per month, not one per week
            — that is a pace holdable in a bad month, and a queue that stalls is
            worse than no queue at all.
          </p>

          {!sections.votesLoaded && (
            <p className="q-warn" role="status">
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
          <section className="q-sec">
            <h2 className="n15-h3">Previous months</h2>
            {months.length === 0 ? (
              <p className="n15-body q-empty">
                No month has completed under this commitment yet. When one has, it
                appears here with the tool that took the slot and whether the vote
                put it there.
              </p>
            ) : (
              <ul className="q-list">
                {months.map((m) => {
                  const tool = getTool(m.toolId);
                  return (
                    <li key={m.month} className="q-month">
                      <span className="q-month-date">{m.month}</span>
                      <span className="q-month-tool">{tool?.name ?? m.toolId}</span>
                      <span className="q-month-state">
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
      </section>

      <BuildLog />
      <Concierge index={index} />
    </>
  );
}
