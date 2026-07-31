import Link from 'next/link';
import { listProspectsAction } from '@/app/actions/prospects';

/**
 * /admin/prospects — real list, replacing the Phase 1 stub. Score shown as
 * a coloured chip (never a bare unexplained number in the list view either —
 * tapping through to the detail page gets the full plain-language warning).
 */
export const dynamic = 'force-dynamic';

function chipClass(score: number | null): string {
  if (score === null) return 'border-rule text-rule';
  if (score >= 70) return 'border-cure/40 bg-cure/5 text-cure';
  if (score >= 45) return 'border-rule bg-sheet text-ink';
  if (score >= 25) return 'border-warning/40 bg-warning/5 text-warning';
  return 'border-danger/40 bg-danger/5 text-danger';
}

export default async function ProspectsPage() {
  const prospects = await listProspectsAction();

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-condensed text-2xl font-bold uppercase tracking-wide">Prospects</h1>
        <Link
          href="/admin/prospects/new"
          className="min-h-[2.75rem] rounded-milled bg-hazard px-3 py-2 font-data text-sm font-semibold text-sheet"
        >
          + New
        </Link>
      </div>

      {prospects.length === 0 ? (
        <p className="mt-6 rounded-milled border bg-sheet p-4 text-base text-rule">
          No prospects yet. Record one before your first pitch — the scorecard exists to catch a
          dead site before you sell into it.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {prospects.map((p) => (
            <li key={p.id}>
              <Link
                href={'/admin/prospects/' + p.id}
                className="flex items-center justify-between gap-3 rounded-milled border bg-sheet p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-base text-ink">{p.businessName}</p>
                  <p className="font-data text-xs text-rule">
                    {[p.city, p.state].filter(Boolean).join(', ') || '—'} · {p.status}
                  </p>
                </div>
                <span className={'shrink-0 rounded-milled border px-2 py-1 font-data text-xs ' + chipClass(p.qualificationScore)}>
                  {p.qualificationScore ?? '—'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
