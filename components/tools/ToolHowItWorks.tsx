import { mediaSlotByKey, type MediaSlot } from '@/lib/tools/media-types';
import type { ToolStep } from '@/lib/tools/catalogue';

/**
 * components/tools/ToolHowItWorks.tsx — the sequence, with a frame per step.
 *
 * NUMBERED, because this genuinely is an order: the photo cannot be read before
 * it is sent. Numbering an unordered set of features would be decoration, but
 * here the order carries the information the reader wants — he is working out
 * whether his customer could actually get through it.
 *
 * WRITTEN FOR THE CONTRACTOR ABOUT HIS CUSTOMER. Every step says "they", not
 * "you". He is not going to use this himself; he is deciding whether a
 * homeowner on a phone at nine at night will get to the end.
 *
 * ============================================================================
 * A DECLARED PICTURE SHOWS ITS SLOT. AN UNDECLARED ONE SHOWS NOTHING.
 * ============================================================================
 *
 * These two cases used to behave identically and that was the bug:
 *
 *   mediaKey: null          the author decided this step needs no picture.
 *                           Text runs full width. Correct, and unchanged.
 *
 *   mediaKey: 'epoxy-lead'  the author decided a picture BELONGS here and the
 *                           file does not exist yet. This now renders a
 *                           reserved frame naming the key.
 *
 * Treating the second like the first made every picture position on the page
 * invisible, because a key only resolves once a row exists in tool_media — so
 * "declared but missing" is the normal state right now, not an edge case. There
 * was no way to see where the pictures go, or that the feature existed.
 *
 * THE FRAME NAMES ITS KEY. Not "image missing" — the actual mediaKey, so the
 * person looking at the page knows which slot in /admin/media fills it. An
 * empty state that does not tell you how to fix it is just a hole.
 *
 * This is a PRE-LAUNCH state and it should not survive contact with real
 * traffic: a visitor seeing five reserved frames learns the product is
 * unfinished. Fill them, or set mediaKey to null on the steps that will never
 * have one.
 *
 * Server component.
 */

export function ToolHowItWorks({ steps, slots }: { steps: ToolStep[]; slots: MediaSlot[] }) {
  if (steps.length === 0) return null;

  return (
    <section className="n15-sec" aria-labelledby="how-h">
      <div className="n15-in">
        <p className="n15-eyebrow">How it works</p>
        <h2 id="how-h" className="n15-h2">
          What your customer actually does.
        </h2>

        <ol className="hw-list">
          {steps.map((step, i) => {
            const media = mediaSlotByKey(slots, step.mediaKey);
            // Declared but not yet filled. The slot is shown, not skipped.
            const reserved = !media && step.mediaKey !== null;
            const hasFrame = Boolean(media) || reserved;
            return (
              <li key={step.head} className={'hw-step' + (hasFrame ? '' : ' hw-step-plain')}>
                <div className="hw-text">
                  <span className="hw-n">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="n15-h3 hw-head">{step.head}</h3>
                  <p className="n15-body">{step.body}</p>
                </div>

                {media && (
                  <figure className="hw-media">
                    {/* Plain <img>: several of these are animations and the
                        optimizer flattens those to a single frame. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={media.src} alt={media.alt} loading="lazy" decoding="async" />
                  </figure>
                )}

                {reserved && (
                  // aria-hidden: it is scaffolding for whoever is building the
                  // page, not content. A screen reader announcing "slot,
                  // epoxy-lead" to a contractor would be noise.
                  <div aria-hidden className="hw-media hw-media-slot">
                    <div className="hw-slot-inner">
                      <span className="hw-slot-k">Picture slot</span>
                      <span className="hw-slot-t">{step.mediaKey}</span>
                      <span className="hw-slot-h">Add it in /admin/media</span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
