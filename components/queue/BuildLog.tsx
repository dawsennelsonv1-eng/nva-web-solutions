import { getBuildLog } from '@/lib/queue/data';
import { getTool } from '@/lib/queue/tools';

/**
 * components/queue/BuildLog.tsx — timestamped one-line entries from real work.
 *
 * A contractor who checks back in three weeks and sees this has moved knows
 * somebody is still here. That is stronger than any badge, and it costs nothing
 * when you commit daily.
 *
 * THE ENTRIES ARE REAL OR THERE ARE NONE. No seed rows exist and none can be
 * generated — every line in this table was typed into the admin form after the
 * work shipped. When the table is empty the section says so, which is a worse
 * look for one week and a much better one for the following year.
 *
 * Mono is correct here: the log is measured values and timestamps, which is
 * one of the three places 13A permits it.
 */

export async function BuildLog() {
  const entries = await getBuildLog();

  return (
    <section className="bg-ink px-4 py-12 text-sheet" aria-labelledby="log-h">
      <div className="mx-auto max-w-5xl">
        <h2 id="log-h" className="font-display text-2xl font-extrabold uppercase">
          Build log
        </h2>

        {entries.length === 0 ? (
          <p className="mt-3 max-w-[60ch] text-base">
            Nothing logged yet. Entries appear here when work ships, and they are written by hand
            after the fact rather than generated — which is why this section is empty instead of
            full of plausible lines.
          </p>
        ) : (
          <ul className="mt-4 max-w-[70ch]">
            {entries.map((e, i) => {
              const tool = e.toolId ? getTool(e.toolId) : undefined;
              return (
                <li
                  key={`${e.occurredOn}-${i}`}
                  className="border-b border-rule py-2 font-data text-xs tabular last:border-b-0"
                >
                  {e.occurredOn}
                  {tool ? ` · ${tool.trade.toLowerCase()}` : ''} · {e.entry}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
