import type { ToolFeature } from '@/lib/tools/catalogue';

/**
 * components/tools/ToolFeatures.tsx — what it changes about his week.
 *
 * EVERY HEADING IS AN OUTCOME, NEVER A CAPABILITY. "You stop losing the
 * nine-o-clock jobs", not "instant quoting". A capability list asks the reader
 * to do the translation into his own business, and most readers will not
 * bother — they will skim it and decide it sounds like every other tool.
 *
 * NO ICONS, consistent with the homepage: these are all abstractions, and there
 * is no drawing of "you stop driving out to jobs you were never going to win"
 * that carries information.
 *
 * Server component.
 */

export function ToolFeatures({ features }: { features: ToolFeature[] }) {
  if (features.length === 0) return null;

  return (
    <section className="n15-sec" aria-labelledby="feat-h">
      <div className="n15-in">
        <p className="n15-eyebrow">What changes</p>
        <h2 id="feat-h" className="n15-h2">
          What it does for your week.
        </h2>

        <div className="wu-grid">
          {features.map((f) => (
            <div key={f.head} className="wu-item">
              <h3>{f.head}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
