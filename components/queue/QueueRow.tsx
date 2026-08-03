import Link from 'next/link';
import { Plate } from '@/components/ui/Plate';
import { VOTE_DISPLAY_FLOOR } from '@/lib/queue/tools';
import type { QueueRow as Row } from '@/lib/queue/data';

/**
 * components/queue/QueueRow.tsx — one line of the queue.
 *
 * ORDERED ROWS, NOT A GRID. A grid of cards reads as a catalogue you could buy
 * from, which would make seventeen unbuilt entries seventeen offers. A stack of
 * rows reads as a schedule, which is what this is, and which is a document the
 * reader already runs one of every week.
 *
 * THE VOTE DISPLAY RULE. Rank is shown always; the count is shown only above
 * ten. Rank is honest at any scale and is never embarrassing — #4 is #4 whether
 * the field has forty votes or four. A bare "2 votes" is worse than silence,
 * because it invites the reader to conclude nobody is here, and the fix for
 * that is more votes rather than a hidden number.
 */

function voteLabel(row: Row): string {
  if (row.status === 'QUEUED' && row.rank !== null) {
    return row.votes >= VOTE_DISPLAY_FLOOR
      ? `#${row.rank} in queue · ${row.votes} votes`
      : `#${row.rank} in queue`;
  }
  if (row.status === 'SPEC ONLY') return 'Taking votes';
  return '';
}

export function QueueRow({ row }: { row: Row }) {
  const label = voteLabel(row);

  return (
    <li className="border-b border-rule last:border-b-0">
      <Link href={`/queue/${row.tool.id}`} className="press block py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold">{row.tool.name}</h3>
            <p className="mt-1 max-w-[52ch] text-sm">{row.tool.prices}</p>

            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-data text-2xs uppercase tracking-[0.08em] text-rule">
              {row.status === 'IN SERVICE' && row.deploys !== null && (
                <span>
                  {row.deploys} live {row.deploys === 1 ? 'install' : 'installs'}
                </span>
              )}
              {row.status === 'IN BUILD' && row.tool.targetMonth && (
                <span>Expected {row.tool.targetMonth}</span>
              )}
              {label && <span>{label}</span>}
            </p>
          </div>

          <Plate
            unit={row.tool.unit}
            status={row.status}
            rev={row.tool.rev}
            date={row.tool.date}
            /* The Plate's count field reports OPERATION, not demand. Installs,
               always — including the honest zero on everything unbuilt. Demand
               lives in the line above, where the vote display rule governs it
               and a bare small number never appears. */
            count={{ label: 'Installs', value: row.deploys ?? 0 }}
          />
        </div>
      </Link>
    </li>
  );
}
