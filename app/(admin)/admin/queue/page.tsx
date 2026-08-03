import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getQueueSections } from '@/lib/queue/data';
import { TOOLS, getTool } from '@/lib/queue/tools';
import { addBuildLogEntry } from '@/app/actions/queue';

/**
 * app/(admin)/admin/queue/page.tsx — THE ROADMAP.
 *
 * Votes broken down three ways, because each answers a different question:
 *   by tool   what to build next
 *   by trade  who is actually showing up, which is not the same thing
 *   by city   whether demand is one market or spread, which decides whether a
 *             build is worth it at all
 *
 * ⚠ AUTH ASSUMPTION, FLAGGED. This page sits inside the (admin) route group and
 * relies on that group's layout for access control, the same as every other
 * admin page. lib/auth/admin.ts was not in scope for this phase so no guard is
 * imported here directly. The build log ACTION does not rely on that — server
 * actions are reachable independently of any layout, so it checks its own
 * shared secret. See app/actions/queue.ts.
 */

export const dynamic = 'force-dynamic';

/**
 * A server action passed to a form's `action` prop must resolve to void.
 * addBuildLogEntry returns a result object, so this thin wrapper discards it;
 * the page revalidates and the new entry appears in the log below.
 */
async function submitLog(formData: FormData) {
  'use server';
  await addBuildLogEntry(formData);
}

interface VoteRow {
  tool_id: string;
  trade: string;
  city: string;
  email: string | null;
  created_at: string;
}

async function fetchVotes(): Promise<VoteRow[] | null> {
  try {
    const db = getSupabaseAdminClient();
    const { data, error } = await db
      .from('tool_votes')
      .select('tool_id, trade, city, email, created_at')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error || !data) return null;
    return data as VoteRow[];
  } catch {
    return null;
  }
}

async function fetchConcierge() {
  try {
    const db = getSupabaseAdminClient();
    const { data, error } = await db
      .from('concierge_requests')
      .select('trade, city, wants, email, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return data as {
      trade: string;
      city: string;
      wants: string | null;
      email: string | null;
      created_at: string;
    }[];
  } catch {
    return [];
  }
}

function tally(rows: VoteRow[], key: 'tool_id' | 'trade' | 'city') {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = (r[key] ?? '').trim().toLowerCase();
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function Tally({ heading, rows }: { heading: string; rows: [string, number][] }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-semibold uppercase tracking-tight">{heading}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-rule">Nothing yet.</p>
      ) : (
        <ul className="mt-2 border-t border-rule">
          {rows.map(([k, n]) => (
            <li key={k} className="flex justify-between border-b border-rule py-2 text-sm">
              <span>{heading === 'By tool' ? (getTool(k)?.name ?? k) : k}</span>
              <span className="font-data tabular">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function AdminQueuePage() {
  const [votes, concierge, sections] = await Promise.all([
    fetchVotes(),
    fetchConcierge(),
    getQueueSections(),
  ]);

  const rows = votes ?? [];
  const today = sections.inBuild[0]?.tool.targetMonth ?? '';

  return (
    <div className="px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-2xl font-extrabold uppercase">Queue</h1>
        <p className="mt-2 text-sm text-rule">
          {votes === null
            ? 'Votes could not be read.'
            : `${rows.length} votes recorded. In build: ${
                sections.inBuild[0]?.tool.name ?? 'nothing'
              }${today ? ` (${today})` : ''}.`}
        </p>

        <Tally heading="By tool" rows={tally(rows, 'tool_id')} />
        <Tally heading="By trade" rows={tally(rows, 'trade')} />
        <Tally heading="By city" rows={tally(rows, 'city')} />

        {/* BUILD LOG ENTRY. One date, one line, one button — under a minute
            from a phone, on a page you are already signed into. */}
        <section className="mt-10 border border-rule p-4">
          <h2 className="font-display text-lg font-semibold uppercase tracking-tight">
            Add a build log entry
          </h2>
          <p className="mt-1 text-sm text-rule">
            Appears on /queue immediately. Nothing else writes to this table.
          </p>

          <form action={submitLog} className="mt-4">
            <label className="block" htmlFor="log-date">
              <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                Date (YYYY-MM-DD)
              </span>
              <input
                id="log-date"
                name="occurredOn"
                required
                placeholder="2026-08-03"
                className="mt-1 w-full rounded-none border border-rule px-3 py-3 text-base"
              />
            </label>

            <label className="mt-3 block" htmlFor="log-tool">
              <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                Tool (optional)
              </span>
              <select
                id="log-tool"
                name="toolId"
                className="mt-1 w-full rounded-none border border-rule px-3 py-3 text-base"
              >
                <option value="">Platform / none</option>
                {TOOLS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block" htmlFor="log-entry">
              <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                Entry (3–160 characters)
              </span>
              <input
                id="log-entry"
                name="entry"
                required
                maxLength={160}
                placeholder="price engine rev 12 deployed"
                className="mt-1 w-full rounded-none border border-rule px-3 py-3 text-base"
              />
            </label>

            <label className="mt-3 block" htmlFor="log-token">
              <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                Admin token
              </span>
              <input
                id="log-token"
                name="token"
                type="password"
                required
                className="mt-1 w-full rounded-none border border-rule px-3 py-3 text-base"
              />
            </label>

            <button
              type="submit"
              className="press mt-4 w-full rounded-milled border border-ink bg-hazard px-4 py-3 text-base text-sheet"
            >
              Write entry
            </button>
          </form>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold uppercase tracking-tight">
            Concierge requests
          </h2>
          <p className="mt-1 text-sm text-rule">
            Trades with no tool and no spec sheet. Not yet mirrored into leads.
          </p>
          {concierge.length === 0 ? (
            <p className="mt-2 text-sm text-rule">Nothing yet.</p>
          ) : (
            <ul className="mt-2 border-t border-rule">
              {concierge.map((c, i) => (
                <li key={`${c.created_at}-${i}`} className="border-b border-rule py-3 text-sm">
                  <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                    {c.created_at.slice(0, 10)} · {c.city}
                  </span>
                  <span className="mt-1 block">{c.trade}</span>
                  {c.wants && <span className="mt-1 block text-rule">{c.wants}</span>}
                  {c.email && <span className="mt-1 block font-data text-xs">{c.email}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
