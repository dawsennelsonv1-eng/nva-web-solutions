import Link from 'next/link';
import { VOTE_DISPLAY_FLOOR } from '@/lib/queue/tools';
import type { QueueRow as Row } from '@/lib/queue/data';

/**
 * components/queue/QueueRow.tsx — one line of the queue. Restyled, 16H.
 *
 * ============================================================================
 * STILL ROWS. STILL NOT A GRID. THIS IS THE ONE THING NOT TO CHANGE.
 * ============================================================================
 *
 * Everything else on the site moved to cards in 15B, and the obvious instinct
 * here is to follow. It would be wrong, for the reason the original file gives:
 * a grid of cards reads as a catalogue you could buy from, and seventeen unbuilt
 * entries in a catalogue are seventeen offers that do not exist. A stack of rows
 * reads as a schedule — a document the reader already runs one of every week.
 *
 * So this stays a list. What changed is the type, the spacing and the status
 * treatment; the shape of the information is identical.
 *
 * ============================================================================
 * THE VOTE DISPLAY RULE IS UNTOUCHED
 * ============================================================================
 *
 * Rank always, count only above VOTE_DISPLAY_FLOOR. Rank is honest at any scale
 * and never embarrassing — #4 is #4 whether the field has forty votes or four. A
 * bare "2 votes" is worse than silence because it invites the reader to conclude
 * nobody is here, and the fix for that is more votes, not a hidden number.
 *
 * ============================================================================
 * THE PLATE IS REPLACED, NOT REMOVED FROM THE REPO
 * ============================================================================
 *
 * components/ui/Plate.tsx is untouched and still serves /queue/[toolId], which
 * is not restyled yet. It cannot be redrawn without changing that page too.
 *
 * The pill that replaces it carries the status and the unit number — the two
 * facts a scanning reader uses. The revision and date are dropped from the ROW
 * and remain on the spec sheet, where somebody who wants them is already
 * looking. The install count moves into the metadata line beside the votes.
 *
 * That last point preserves the original's distinction exactly: this line
 * reports OPERATION (installs, including the honest zero) separately from
 * DEMAND (rank and votes), and the vote display rule governs only the second.
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
  const live = row.status === 'IN SERVICE';

  return (
    <li className="qr">
      <Link href={`/queue/${row.tool.id}`} className="qr-link">
        <div className="qr-main">
          <h3 className="qr-name">{row.tool.name}</h3>
          <p className="qr-prices">{row.tool.prices}</p>

          <p className="qr-meta">
            {live && row.deploys !== null && (
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

        <span className={'tc-status qr-status' + (live ? '' : ' qr-status-quiet')}>
          <span aria-hidden className="tc-dot" />
          {row.status}
          <span className="tc-unit">· {row.tool.unit}</span>
        </span>
      </Link>
    </li>
  );
}
