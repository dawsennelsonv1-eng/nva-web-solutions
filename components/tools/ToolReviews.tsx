import Link from 'next/link';
import type { ToolReview } from '@/lib/tools/catalogue';

/**
 * components/tools/ToolReviews.tsx — what customers said, or that none have.
 *
 * ============================================================================
 * THE EMPTY STATE IS THE POINT, AND IT IS NOT A PLACEHOLDER
 * ============================================================================
 *
 * There are no reviews. Rather than leave the section out until there are, it
 * renders and says so.
 *
 * That is the better move on THIS site specifically. Every other section here
 * makes a checkable claim — the pricing model is published, the status of each
 * tool is reconciled against the code, the install count is counted rather than
 * rounded. A page that behaves that way everywhere and then quietly omits the
 * reviews section is doing the same thing every other site does. Saying "nobody
 * has left one yet, we launched this quarter" is consistent with the rest, and
 * a contractor who reads it knows what kind of company he is dealing with.
 *
 * ============================================================================
 * WHAT MUST NEVER GO IN THE ARRAY
 * ============================================================================
 *
 * Anything nobody said. Not a composite, not a paraphrase of something a
 * customer mentioned on a call, not an "illustrative example", not a review of
 * a different product by the same person.
 *
 * This is the single highest-leverage place to lie on the whole site and
 * therefore the most damaging. A contractor who suspects one testimonial is
 * invented stops believing the published pricing table on the same page — and
 * that table is the strongest asset here. One fake review costs the argument
 * that everything else is real.
 *
 * When a real one arrives, add it to `reviews` in lib/tools/catalogue.ts with
 * the person's name, business and city. If they will not let you use their
 * name, do not use the review: an anonymous testimonial is worth nothing to a
 * sceptical reader and looks exactly like a fabricated one.
 *
 * The date is shown because a review with no date could be from any era, and a
 * reader checking whether this thing is alive is entitled to know.
 *
 * Server component.
 */

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function ToolReviews({ reviews }: { reviews: ToolReview[] }) {
  return (
    <section className="n15-sec" aria-labelledby="rev-h">
      <div className="n15-in">
        <p className="n15-eyebrow">From contractors</p>
        <h2 id="rev-h" className="n15-h2">
          {reviews.length === 0 ? 'No reviews yet.' : 'What contractors said.'}
        </h2>

        {reviews.length === 0 ? (
          <>
            <p className="n15-lede">
              This launched recently and nobody has left one. When somebody does,
              it goes here with their name, their business and their city — or it
              does not go here at all.
            </p>
            <p className="n15-small n15-measure">
              There is nothing in this space in the meantime. Every other figure
              on this site is counted or published rather than claimed, and an
              invented testimonial would undo that everywhere else on the page.
            </p>
            <div className="tc-actions n15-actions-wide">
              <Link href="/queue" className="n15-btn n15-btn-ghost">
                See what has actually shipped
              </Link>
            </div>
          </>
        ) : (
          <div className="rv-grid">
            {reviews.map((r) => (
              <figure key={r.name + r.date} className="rv-card">
                <blockquote className="rv-quote">{r.quote}</blockquote>
                <figcaption className="rv-who">
                  <span className="rv-name">{r.name}</span>
                  <span className="rv-biz">
                    {r.business} · {r.city}
                  </span>
                  <span className="rv-date">{shortDate(r.date)}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
