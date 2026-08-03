import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getQueueRow } from '@/lib/queue/data';
import { getTool } from '@/lib/queue/tools';
import { Plate } from '@/components/ui/Plate';
import { VoteForm } from '@/components/queue/VoteForm';

/**
 * app/(public)/queue/[toolId]/page.tsx — THE SPEC SHEET.
 *
 * Clicking an unbuilt tool opens its real specification, not an email modal.
 * He gets a document first. Asking before giving is agency behaviour, and this
 * audience has met that agency.
 *
 * THIS IS THE PROOF OF REALNESS. Anyone can list a trade name. Only somebody
 * who has shipped two of these can write the fourth one's input schema and its
 * arithmetic. A roofer reading the roofing sheet knows within four seconds
 * whether the person who wrote it understands his trade — which is why the
 * device inverts completely if the maths is wrong. Amateur maths on a spec
 * sheet is worse than no spec sheet.
 *
 * Static params are generated for all nineteen so each sheet is a real URL
 * with its own Open Graph card, and a texted link previews as that tool rather
 * than as the site.
 */

/**
 * Rendered per request rather than pre-generated: rank moves when somebody
 * votes, and a cached sheet showing yesterday's rank would undermine the one
 * thing this page is asking him to believe. generateStaticParams is therefore
 * deliberately absent — it has no effect alongside force-dynamic and pairing
 * them reads as a mistake.
 */
export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { toolId: string } }): Metadata {
  const tool = getTool(params.toolId);
  if (!tool) return { title: 'Not found' };

  const title = `${tool.name} — specification`;
  return {
    title,
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

  return (
    <div className="bg-concrete px-4 pb-16 pt-8">
      <div className="mx-auto max-w-5xl">
        <Plate
          unit={tool.unit}
          status={status}
          rev={tool.rev}
          date={tool.date}
          count={{ label: 'Installs', value: row.deploys ?? 0 }}
        />

        <h1 className="mt-4 max-w-[18ch] font-display text-3xl font-extrabold uppercase">
          {tool.name}
        </h1>
        <p className="mt-3 max-w-[60ch] text-base">{tool.prices}</p>

        {status !== 'IN SERVICE' && (
          <p className="mt-3 max-w-[60ch] text-base">
            {status === 'IN BUILD'
              ? `This one is being built now and is expected in service ${tool.targetMonth}. The specification below is what it is being built to.`
              : 'This tool does not exist. What follows is its specification — what it would price, what it would ask, and the arithmetic it would run. Published so you can check it before it is built rather than after.'}
          </p>
        )}

        {/* INPUTS */}
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold uppercase tracking-tight">
            What it asks
          </h2>
          <table className="mt-3 w-full border-collapse text-sm">
            <caption className="sr-only">Input schema</caption>
            <tbody>
              {tool.inputs.map((i) => (
                <tr key={i.label} className="border-b border-rule">
                  <th
                    scope="row"
                    className="w-2/5 py-2 pr-3 text-left align-top font-normal"
                  >
                    {i.label}
                  </th>
                  <td className="py-2 align-top font-data text-xs text-rule">{i.accepts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* MATH */}
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold uppercase tracking-tight">
            The arithmetic
          </h2>
          <table className="mt-3 w-full border-collapse text-sm">
            <caption className="sr-only">Trade math</caption>
            <tbody>
              {tool.math.map((m) => (
                <tr key={m.label} className="border-b border-rule">
                  <th
                    scope="row"
                    className="w-2/5 py-2 pr-3 text-left align-top font-normal"
                  >
                    {m.label}
                  </th>
                  <td className="py-2 align-top">{m.formula}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {tool.notes && tool.notes.length > 0 && (
          <section className="mt-8 max-w-[62ch]">
            <h2 className="font-display text-lg font-semibold uppercase tracking-tight">
              Worth knowing
            </h2>
            <ul className="mt-3 border-t border-rule">
              {tool.notes.map((n) => (
                <li key={n} className="border-b border-rule py-3 text-sm">
                  {n}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8 max-w-xl">
          {status === 'IN SERVICE' ? (
            <div className="border border-rule bg-sheet p-4">
              <h2 className="font-display text-lg font-semibold">This one is running</h2>
              <p className="mt-2 text-sm">
                Put a job you have already done through it on the homepage and check the number
                against what you charged.
              </p>
              <Link
                href="/"
                className="press mt-3 inline-block rounded-milled border border-ink px-4 py-2.5 text-base"
              >
                Run a job through it
              </Link>
            </div>
          ) : (
            <VoteForm
              toolId={tool.id}
              rank={row.rank}
              votes={row.votes}
              toolName={tool.name}
            />
          )}
        </div>

        <Link
          href="/queue"
          className="press mt-8 inline-block rounded-milled border border-ink px-4 py-2.5 text-base"
        >
          Back to the queue
        </Link>
      </div>
    </div>
  );
}
