import { homepageReadings } from '@/lib/site/metrics';

/**
 * components/site/ProofOfOperation.tsx — instrument readings, not testimonials.
 *
 * A number with a measurement date is credible in a way a testimonial never is,
 * because he can come back next week and check whether it moved. Every value
 * here was counted in the database at request time; anything without a real
 * source is not rendered at all — see lib/site/metrics.ts.
 *
 * THE SECTION STILL DELETES ITSELF. No readings, no section: not a collapsed
 * section, not an empty state, not "coming soon". The heading and every word
 * under it stop existing. That early return is the whole of 13D's fix and it is
 * unchanged here, because a broken-looking section on the one page arguing that
 * the software works is the most expensive possible place to have one.
 *
 * 15B: the Plate is unmounted. It carried a hardcoded unit number, revision and
 * date for the epoxy tool, which duplicated — and could drift from — the same
 * three fields that the tool cards above now read from the catalogue and
 * reconcile against the registry. Two sources for one fact is how a page starts
 * lying slowly. components/ui/Plate.tsx is untouched on disk and still serves
 * the queue pages.
 */

export async function ProofOfOperation() {
  const readings = await homepageReadings();

  // Nothing measurable is true yet. Render nothing at all.
  if (readings.length === 0) return null;

  return (
    <section className="n15-sec" aria-labelledby="proof-h">
      <div className="n15-in">
        <p className="n15-eyebrow">Measured, not claimed</p>
        <h2 id="proof-h" className="n15-h2">
          What the software has actually done.
        </h2>
        <p className="n15-lede">
          Counted from the database when you loaded this page. If a figure has no
          real source, it is not on here.
        </p>

        <dl className="pf-grid">
          {readings.map((r) => (
            <div key={r.label} className="pf-item">
              <dt className="pf-k">{r.label}</dt>
              {/* r.display, not r.value: a duration formats as seconds and a
                  count formats as a count, and metrics.ts is the only place
                  that knows which is which. */}
              <dd className="pf-v">{r.display}</dd>
              <dd className="pf-s">Measured since {r.since}</dd>
            </div>
          ))}
        </dl>

        <div style={{ marginTop: '2rem', maxWidth: '60ch' }}>
          <p className="n15-body">
            That install count is small because this launched this quarter. Being
            early is the offer rather than the problem: founding install pricing
            is locked for the life of the account, and it does not go up when the
            price does.
          </p>
          <p className="n15-small" style={{ marginTop: '1rem' }}>
            Uptime is not on this page and will not be until something outside
            this system measures it. Software cannot honestly report its own
            downtime — if it were down, it would not be writing the row.
          </p>
        </div>
      </div>
    </section>
  );
}
