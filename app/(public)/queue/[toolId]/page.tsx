import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GradientField } from '@/components/site/GradientField';
import { getQueueRow } from '@/lib/queue/data';
import { getTool } from '@/lib/queue/tools';
import { VoteForm } from '@/components/queue/VoteForm';
import { toolPageFor } from '@/lib/tools/catalogue';

/**
 * app/(public)/queue/[toolId]/page.tsx — THE SPEC SHEET. Restyled, 16J.
 *
 * Clicking an unbuilt tool opens its real specification, not an email modal. He
 * gets a document first. Asking before giving is agency behaviour, and this
 * audience has met that agency.
 *
 * THIS IS THE PROOF OF REALNESS. Anyone can list a trade name. Only somebody who
 * has shipped two of these can write the fourth one's input schema and its
 * arithmetic. A roofer reading the roofing sheet knows within four seconds
 * whether the person who wrote it understands his trade — which is why the
 * device inverts completely if the maths is wrong.
 *
 * ============================================================================
 * THE TWO TABLES ARE THE PAGE. THEY GOT THE MOST CARE.
 * ============================================================================
 *
 * "What it asks" and "The arithmetic" are the only reason anybody is here, and
 * they were the thing most damaged by the old treatment: 12px rows, hairline
 * rules, and formulas set in the same size as the labels, so a formula read as
 * caption text rather than as the claim it is.
 *
 * Now the formula column is set in mono at full body size and the label column
 * is quieter than it. That inverts the old hierarchy on purpose — the label is
 * a name for a thing the reader already knows, and the formula is the part he
 * is checking against what he charges.
 *
 * On a phone each row stacks label-over-formula rather than squeezing two
 * columns into 360px, which is where the old table became unreadable exactly
 * when it mattered most.
 *
 * ============================================================================
 * THE PLATE IS GONE, AND IT NOW SERVES NOTHING
 * ============================================================================
 *
 * components/ui/Plate.tsx was mounted in three places: /categories (dropped in
 * 16G), QueueRow (16H), and here. This was the last one.
 *
 * IT IS NOT DELETED. I can only see files pasted into this conversation, so it
 * may be mounted somewhere I have never been shown. Before removing it:
 *
 *   grep -rn "Plate" app components lib
 *
 * If that comes back with only the file itself and the comments referencing it,
 * it is dead and can go. Its four facts all survive on this page: unit and
 * status in the pill, revision and date in the meta line beneath the heading.
 *
 * ============================================================================
 * A RUNNING TOOL NOW POINTS AT ITS PRODUCT PAGE
 * ============================================================================
 *
 * The original sent an IN SERVICE tool to "/" with "Run a job through it",
 * which was correct when the homepage held the only live pricer. Tools have
 * their own pages now, so it links there when one exists and falls back to the
 * homepage when it does not. `toolPageFor` returning undefined is the normal
 * case for most of the nineteen, not an error.
 *
 * force-dynamic stays: rank moves when somebody votes, and a cached sheet
 * showing yesterday's rank would undermine the one thing this page asks him to
 * believe. generateStaticParams remains deliberately absent — it has no effect
 * alongside force-dynamic and pairing them reads as a mistake.
 */

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { toolId: string } }): Metadata {
  const tool = getTool(params.toolId);
  if (!tool) return { title: 'Not found' };

  return {
    title: `${tool.name} — specification`,
    description: tool.prices,
    openGraph: {
      title: `${tool.name} · Girder`,
      description: tool.prices,
      type: 'article',
      images: [{ url: '/og.png', width: 1200, height: 630, alt: tool.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${tool.name} · Girder`,
      description: tool.prices,
    },
  };
}

export default async function SpecSheetPage({ params }: { params: { toolId: string } }) {
  const row = await getQueueRow(params.toolId);
  if (!row) notFound();

  const { tool, status } = row;
  const live = status === 'IN SERVICE';
  const productPage = toolPageFor(tool.id);

  return (
    <>
      <GradientField />
      <article className="n15-sec" aria-labelledby="spec-h">
        <div className="n15-in">
          <span className={'tc-status ss-status' + (live ? '' : ' qr-status-quiet')}>
            <span aria-hidden className="tc-dot" />
            {status}
            <span className="tc-unit">· {tool.unit}</span>
          </span>

          <h1 id="spec-h" className="n15-h2 ss-h">
            {tool.name}
          </h1>

          {/* Revision and date. They were on the Plate; they belong here, in the
              one line a reader checks to see whether this document is current. */}
          <p className="ss-meta">
            <span>Rev {tool.rev}</span>
            <span>{tool.date}</span>
            <span>
              {row.deploys ?? 0} live {(row.deploys ?? 0) === 1 ? 'install' : 'installs'}
            </span>
          </p>

          <p className="n15-lede">{tool.prices}</p>

          {!live && (
            <p className="n15-body n15-measure">
              {status === 'IN BUILD'
                ? `This one is being built now and is expected in service ${tool.targetMonth}. The specification below is what it is being built to.`
                : 'This tool does not exist. What follows is its specification — what it would price, what it would ask, and the arithmetic it would run. Published so you can check it before it is built rather than after.'}
            </p>
          )}

          {/* INPUTS */}
          <section className="ss-sec">
            <h2 className="n15-h3">What it asks</h2>
            <dl className="ss-table">
              {tool.inputs.map((i) => (
                <div key={i.label} className="ss-row">
                  <dt className="ss-label">{i.label}</dt>
                  <dd className="ss-value ss-value-plain">{i.accepts}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* MATH — the reason anybody is on this page. */}
          <section className="ss-sec">
            <h2 className="n15-h3">The arithmetic</h2>
            <p className="n15-small ss-blurb">
              Every figure a quote produces comes out of this. Check it against a
              job you have already done.
            </p>
            <dl className="ss-table">
              {tool.math.map((m) => (
                <div key={m.label} className="ss-row">
                  <dt className="ss-label">{m.label}</dt>
                  <dd className="ss-value ss-formula">{m.formula}</dd>
                </div>
              ))}
            </dl>
          </section>

          {tool.notes && tool.notes.length > 0 && (
            <section className="ss-sec">
              <h2 className="n15-h3">Worth knowing</h2>
              <ul className="ss-notes">
                {tool.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          )}

          <div className="ss-action">
            {live ? (
              <div className="vf">
                <h2 className="n15-h3">This one is running</h2>
                <p className="n15-body vf-lede">
                  Put a job you have already done through it and check the number
                  against what you actually charged. That is the only test of this
                  page that matters.
                </p>
                <div className="tc-actions n15-actions-wide">
                  <Link href="/demo" className="n15-btn n15-btn-primary">
                    Run a job through it
                  </Link>
                  {productPage && (
                    <Link href={`/tools/${tool.id}`} className="n15-btn n15-btn-ghost">
                      More information
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <VoteForm toolId={tool.id} rank={row.rank} votes={row.votes} toolName={tool.name} />
            )}
          </div>

          <p className="ss-back">
            <Link href="/queue" className="n15-btn n15-btn-ghost">
              Back to the queue
            </Link>
          </p>
        </div>
      </article>
    </>
  );
}
