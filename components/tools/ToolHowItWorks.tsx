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
 * A STEP WITHOUT A PICTURE RENDERS AS TEXT, not as an empty frame. `mediaKey:
 * null` and an unresolved key behave identically, which matters because a key
 * only resolves once a recording exists in tool_media — so text-only is the
 * normal state today, not a fallback.
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
            return (
              <li key={step.head} className={'hw-step' + (media ? '' : ' hw-step-plain')}>
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
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
