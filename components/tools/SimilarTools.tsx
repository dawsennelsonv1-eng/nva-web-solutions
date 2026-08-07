import Link from 'next/link';
import { TOOLS } from '@/lib/queue/tools';
import { toolPageFor } from '@/lib/tools/catalogue';

/**
 * components/tools/SimilarTools.tsx — "others like this", at the foot of a tool
 * page.
 *
 * ============================================================================
 * THE BUTTON IS NOT AN ADD TO CART, AND THAT IS DELIBERATE
 * ============================================================================
 *
 * The brief asked for a row shaped like a store's related-products strip with
 * an add-to-cart-style button adapted for software. The shape is here. The
 * button is not a cart button, because there is no cart and there should not
 * be one.
 *
 * A cart implies a thing you buy, receive, and own. What is actually being sold
 * is an install: we brand it, you look at the working version, you pay a setup
 * fee, it goes live on your site. A button promising a checkout that then opens
 * a questionnaire is the kind of small lie a buyer notices immediately, on the
 * page where he has decided to trust you or not.
 *
 * So each card carries the two real actions — try the thing, or read about it —
 * which is exactly what the person scanning this row wants and can act on.
 *
 * ============================================================================
 * ONLY TOOLS WITH A PAGE APPEAR
 * ============================================================================
 *
 * A card is rendered only when the tool has an entry in the catalogue AND that
 * tool is in the public allowlist. Everything else is filtered out silently. A
 * related-products row that links to 404s or to half-finished pages does more
 * damage than an empty row, and if nothing survives the filter the section does
 * not render at all.
 *
 * NOTE: the allowlist is passed in rather than imported. lib/queue is a data
 * layer and PUBLIC_TOOLS is a presentation decision; the page owns it, and
 * having two files disagree about what is public is how a hidden tool leaks.
 *
 * Server component.
 */

export interface SimilarToolsProps {
  /** Tool ids from the current tool's catalogue entry, in order. */
  ids: string[];
  /** Ids the site is currently willing to show. */
  publicIds: readonly string[];
}

export function SimilarTools({ ids, publicIds }: SimilarToolsProps) {
  const cards = ids
    .filter((id) => publicIds.includes(id))
    .map((id) => {
      const page = toolPageFor(id);
      const tool = TOOLS.find((t) => t.id === id);
      if (!page || !tool) return null;
      return { id, title: page.title, trade: tool.trade, tagline: page.tagline };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (cards.length === 0) return null;

  return (
    <section className="n15-sec" aria-labelledby="similar-h">
      <div className="n15-in">
        <p className="n15-eyebrow">Others like this</p>
        <h2 id="similar-h" className="n15-h2">
          Built the same way, for a different trade.
        </h2>

        <div className="sim-row">
          {cards.map((c) => (
            <article key={c.id} className="sim-card">
              <p className="sim-trade">{c.trade}</p>
              <h3 className="sim-title">{c.title}</h3>
              {/* Clamped rather than truncated in the data, so the full line is
                  still there for a screen reader and for search. */}
              <p className="sim-tag">{c.tagline}</p>
              <div className="sim-actions">
                <Link href="/demo" className="n15-btn n15-btn-primary">
                  Try me out
                </Link>
                <Link href={`/tools/${c.id}`} className="n15-btn n15-btn-ghost">
                  More information
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
