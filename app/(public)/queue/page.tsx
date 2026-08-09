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
          <p className="n15-eyebrow">The build schedule</p>
          <h1 id="queue-h" className="n15-h2">
            What gets built next, and who decides
          </h1>

          {/*
            PHASE 17G — THE FRAMING CHANGED. NO HONESTY WAS REMOVED.

            This used to open by counting what does not exist: "17 of the 19
            tools on this page do not exist." That was written as a trust
            device, and as a device it works — voluntarily naming your own
            weakness is the one thing an agency never does.

            But it was doing that job twice. EVERY ROW BELOW ALREADY CARRIES ITS
            REAL STATUS, reconciled against the registry at request time, and a
            reader learns more from four honest section headings than from a
            deficit total. The sentence added no fact; it only chose the
            emphasis, and the emphasis it chose was "we have not built this".

            So the page now leads with the MECHANISM — one tool a month, votes
            decide the order — which is the genuinely unusual thing here and the
            reason to believe the rest. A contractor scanning this wants to know
            when his trade arrives and what moves it. The count told him neither.

            WHAT IS NOT ALLOWED BACK: any status that is not computed, any
            ordering that is not the real vote ordering, any empty section that
            pretends to be full. Those are the load-bearing parts. The opening
            sentence was not.
          */}
          <p className="n15-lede">
            One tool enters build every month, and whichever one leads this queue
            on the 1st is the one that does. That is the whole rule. There is no
            roadmap meeting and nothing jumps the line.
          </p>
          <p className="n15-body n15-measure">
            {built === 1
              ? 'One tool is running on live sites today.'
              : `${built} tools are running on live sites today.`}{' '}
            The rest are at the stage this page says they are — being built,
            waiting on votes, or written up and not started. Every status below
            is checked against the code as the page loads, so it goes down as
            well as up.
          </p>
          <p className="n15-body n15-measure">
            One a month rather than one a week is deliberate: it is a pace that
            survives a bad month, and a queue that stalls is worse than no queue.
          </p>

          {!sections.votesLoaded && (
            <p className="q-warn" role="status">
              Vote counts could not be read just now. Ranking below is incomplete.
            </p>
          )}

          <Section
            heading="Running now"
            blurb="Built, installed, and quoting jobs on live sites today."
            rows={sections.inService.map((r) => <QueueRow key={r.tool.id} row={r} />)}
            empty={sections.inService.length === 0 ? 'Nothing is running yet.' : undefined}
          />

          <Section
            heading="Being built this month"
            blurb="One at a time, with the month it should be running."
            rows={sections.inBuild.map((r) => <QueueRow key={r.tool.id} row={r} />)}
            empty={
              sections.inBuild.length === 0
                ? 'Nothing is being built this month. Whichever tool leads the list below on the 1st takes the slot.'
                : undefined
            }
          />

          <Section
            heading="Next up — the order is yours"
            blurb="Ranked by votes from contractors. A tool joins this list the moment it gets its first one."
            rows={sections.queued.map((r) => <QueueRow key={r.tool.id} row={r} />)}
            empty={
              sections.queued.length === 0
                ? 'No votes yet. The first tool to get one appears here, ranked, and the list fills from there. Nothing has been seeded to make this look busier than it is.'
                : undefined
            }
          />

          <Section
            heading="Written up, not started"
            blurb="What it would ask and how it would price is published. Open one and check the arithmetic against a job you have done."
            rows={sections.specOnly.map((r) => <QueueRow key={r.tool.id} row={r} />)}
            empty={sections.specOnly.length === 0 ? 'Everything specified has been started.' : undefined}
          />

          {/* THE RECEIPTS. Empty until a month completes; the moment one row
              shows a tool that shipped because it won the vote, this page stops
              being a promise and becomes evidence. */}
          <section className="q-sec">
            <h2 className="n15-h3">Previous months</h2>
            {months.length === 0 ? (
              <p className="n15-body q-empty">
                No month has finished under this rule yet. When one has, it shows
                up here with the tool that took the slot and whether the vote is
                what put it there.
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
