import { getBuildLog } from '@/lib/queue/data';
import { getTool } from '@/lib/queue/tools';

/**
 * components/queue/BuildLog.tsx — timestamped one-line entries from real work.
 * Restyled, 16H.
 *
 * A contractor who checks back in three weeks and sees this has moved knows
 * somebody is still here. That is stronger than any badge, and it costs nothing
 * when you commit daily.
 *
 * THE ENTRIES ARE REAL OR THERE ARE NONE. No seed rows exist and none can be
 * generated — every line was typed into the admin form after the work shipped.
 * When the table is empty the section says so, which is a worse look for one
 * week and a much better one for the following year.
 *
 * ============================================================================
 * THIS SECTION KEEPS ITS OWN GROUND, AND IT IS THE ONLY ONE THAT DOES
 * ============================================================================
 *
 * Every other restyled section is transparent so the gradient field runs
 * through it. This one paints a darker panel, deliberately: the build log is a
 * terminal, and the reader should feel the register change when he reaches it.
 * It is also the last thing on the page, so an opaque band here reads as a foot
 * rather than as an interruption.
 *
 * The panel is a TRANSLUCENT overlay rather than an opaque block, so it darkens
 * the field instead of covering it — which is what keeps it from reintroducing
 * the 15A.3 seam that an opaque in-flow section caused.
 *
 * MONO STAYS. The log is measured values and timestamps, which is one of the
 * three places 13A permits it, and a serif date column would be absurd. The
 * legacy `font-data` class is replaced with the 15A mono token so it no longer
 * depends on the old system.
 */

export async function BuildLog() {
  const entries = await getBuildLog();

  return (
    <section className="bl" aria-labelledby="log-h">
      <div className="n15-in">
        <p className="n15-eyebrow">Build log</p>
        <h2 id="log-h" className="n15-h2 bl-h">
          What actually shipped, and when.
        </h2>

        {entries.length === 0 ? (
          <p className="n15-body n15-measure">
            Nothing logged yet. Entries appear here when work ships, and they are
            written by hand after the fact rather than generated — which is why
            this section is empty instead of full of plausible lines.
          </p>
        ) : (
          <ul className="bl-list">
            {entries.map((e, i) => {
              const tool = e.toolId ? getTool(e.toolId) : undefined;
              return (
                <li key={`${e.occurredOn}-${i}`} className="bl-entry">
                  <span className="bl-date">{e.occurredOn}</span>
                  <span className="bl-text">
                    {tool ? `${tool.trade.toLowerCase()} · ` : ''}
                    {e.entry}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
