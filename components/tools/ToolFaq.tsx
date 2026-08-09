import type { ToolFaqItem } from '@/lib/tools/catalogue';

/**
 * components/tools/ToolFaq.tsx — questions about USING it.
 *
 * Deliberately not questions about buying it. Contract, refund, cancellation
 * and data ownership are answered on /pricing and /terms; repeating them here
 * would mean two copies of a promise, which is how a promise starts to drift.
 * These are the questions somebody asks while deciding whether the thing would
 * work in his hands.
 *
 * NATIVE <details>, so this ships zero client JavaScript. An accordion built in
 * React would add a hydration boundary to a page that already mounts a live
 * pricing card and a widget — and would work no better.
 *
 * Reuses the .fq styles from phase15b.css rather than defining a second
 * accordion. Two accordion languages on one site is how a site starts looking
 * assembled rather than designed.
 *
 * Server component.
 */

export function ToolFaq({ items }: { items: ToolFaqItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="n15-sec" aria-labelledby="toolfaq-h">
      <div className="n15-in">
        <p className="n15-eyebrow">Questions</p>
        <h2 id="toolfaq-h" className="n15-h2">
          How it works, in detail.
        </h2>

        <div className="fq">
          {items.map((i) => (
            <details key={i.q}>
              <summary>{i.q}</summary>
              <p>{i.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
