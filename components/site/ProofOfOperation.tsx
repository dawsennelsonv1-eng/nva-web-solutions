import { homepageReadings } from '@/lib/site/metrics';
import { Plate } from '@/components/ui/Plate';

/**
 * components/site/ProofOfOperation.tsx — instrument readings, not testimonials.
 *
 * A number with a measurement date is credible in a way a testimonial never
 * is, because he can come back next week and check whether it moved. Every
 * value here was counted in the database at request time; anything without a
 * real source is not rendered at all — see lib/site/metrics.ts for the list of
 * what is missing and why.
 *
 * The install count is stated rather than hidden, and paired with the reason
 * and the offer that follows from it. A suspicious buyer assumes every number
 * on a marketing site is inflated; a small number you could easily have
 * concealed recalibrates everything else on the page as probably true.
 */

export async function ProofOfOperation() {
  const readings = await homepageReadings();

  return (
    <section className="bg-sheet px-4 py-14" aria-labelledby="proof-h">
      <div className="mx-auto max-w-5xl">
        <Plate unit="NVA-EPX-01" status="IN SERVICE" rev={12} date="2026-08" count={{ label: 'Verticals live', value: 1 }} />

        <h2 id="proof-h" className="mt-6 font-display text-2xl font-extrabold uppercase">
          What the software has actually done
        </h2>
        <p className="mt-2 max-w-[60ch] text-base">
          Counted from the database when you loaded this page. If a figure has no real source, it
          is not on here.
        </p>

        {readings.length > 0 && (
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            {readings.map((r) => (
              <div key={r.label} className="border border-rule p-4">
                <dt className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                  {r.label}
                </dt>
                <dd className="mt-1 font-data text-3xl tabular text-cure">{r.value}</dd>
                <dd className="mt-1 font-data text-2xs uppercase tracking-[0.08em] text-rule">
                  Measured since {r.since}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-6 max-w-[60ch] border-t border-rule pt-4">
          <p className="text-base">
            That install count is small because this launched this quarter. Being early is the
            offer rather than the problem: founding install pricing is locked for the life of the
            account, and it does not go up when the price does.
          </p>
          <p className="mt-3 text-sm text-rule">
            Uptime, median time to a quote, and AI response time are not on this page yet because
            nothing in the system records them honestly today. They arrive with the build log, and
            they will carry the same date stamps as everything above.
          </p>
        </div>
      </div>
    </section>
  );
}
