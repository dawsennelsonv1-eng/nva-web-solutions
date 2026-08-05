import { homepageReadings } from '@/lib/site/metrics';
import { Plate } from '@/components/ui/Plate';

/**
 * components/site/ProofOfOperation.tsx — instrument readings, not testimonials.
 *
 * A number with a measurement date is credible in a way a testimonial never
 * is, because he can come back next week and check whether it moved. Every
 * value here was counted in the database at request time; anything without a
 * real source is not rendered at all — see lib/site/metrics.ts.
 *
 * ============================================================================
 * 13D: THE SECTION NOW DELETES ITSELF
 * ============================================================================
 *
 * The 13B version gated the GRID on having readings, but rendered the heading
 * and the "counted from the database when you loaded this page" paragraph
 * unconditionally. So with an empty database the page announced data,
 * explained how rigorously that data was gathered, and then showed none.
 *
 * That is worse than saying nothing. A visitor does not read it as "this
 * platform is new" — he reads it as a broken section, and a broken section on
 * the one page arguing that the software works is the most expensive possible
 * place to have one.
 *
 * So the early return is the whole fix: no readings, no section. Not a
 * collapsed section, not an empty state, not "coming soon" — the heading and
 * every word under it stop existing. One real number beats a section promising
 * five it does not have; zero real numbers beat a section promising five it
 * does not have by an even wider margin.
 *
 * THE INSTALL COUNT IS STATED RATHER THAN HIDDEN, and paired with the reason
 * and the offer that follows from it. A suspicious buyer assumes every number
 * on a marketing site is inflated; a small number you could easily have
 * concealed recalibrates everything else on the page as probably true. That
 * paragraph is inside the guard because it is a gloss ON the numbers — without
 * them it is an unprompted apology for a count nobody was shown.
 */

export async function ProofOfOperation() {
  const readings = await homepageReadings();

  // Nothing measurable is true yet. Render nothing at all.
  if (readings.length === 0) return null;

  return (
    <section className="bg-sheet px-4 py-14" aria-labelledby="proof-h">
      <div className="mx-auto max-w-5xl">
        <Plate
          unit="NVA-EPX-01"
          status="IN SERVICE"
          rev={12}
          date="2026-08"
          count={{ label: 'Readings live', value: readings.length }}
        />

        <h2 id="proof-h" className="mt-6 font-display text-2xl font-extrabold uppercase">
          What the software has actually done
        </h2>
        <p className="mt-2 max-w-[60ch] text-base">
          Counted from the database when you loaded this page. If a figure has no real source, it
          is not on here.
        </p>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          {readings.map((r) => (
            <div key={r.label} className="border border-rule p-4">
              <dt className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                {r.label}
              </dt>
              {/* r.display, not r.value: a duration formats as seconds and a
                  count formats as a count, and metrics.ts is the only place
                  that knows which is which. */}
              <dd className="mt-1 font-data text-3xl tabular text-cure">{r.display}</dd>
              <dd className="mt-1 font-data text-2xs uppercase tracking-[0.08em] text-rule">
                Measured since {r.since}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 max-w-[60ch] border-t border-rule pt-4">
          <p className="text-base">
            That install count is small because this launched this quarter. Being early is the
            offer rather than the problem: founding install pricing is locked for the life of the
            account, and it does not go up when the price does.
          </p>
          <p className="mt-3 text-sm text-rule">
            Uptime is not on this page and will not be until something outside this system
            measures it. Software cannot honestly report its own downtime — if it were down, it
            would not be writing the row.
          </p>
        </div>
      </div>
    </section>
  );
}
