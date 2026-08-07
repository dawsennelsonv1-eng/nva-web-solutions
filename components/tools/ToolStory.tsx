import { mediaSlotByKey, type MediaSlot } from '@/lib/tools/media';
import type { ToolStoryPoint } from '@/lib/tools/catalogue';

/**
 * components/tools/ToolStory.tsx — what it does, one point at a time, each with
 * its own picture.
 *
 * ============================================================================
 * ALTERNATING SIDES, AND WHY THAT IS NOT DECORATION
 * ============================================================================
 *
 * On a wide screen the image sits opposite the text and swaps sides each point.
 * That is not a visual trick — it gives the eye a reason to travel down the
 * page instead of running straight past a stack of identical blocks, and it
 * makes each point read as a separate claim rather than as a bullet list that
 * happened to get pictures.
 *
 * On a phone every point is one column, image under text, because a 360px
 * screen has no sides.
 *
 * ============================================================================
 * A POINT WITHOUT A PICTURE IS ALLOWED
 * ============================================================================
 *
 * `mediaKey: null` renders the text at full measure with no frame at all — not
 * a placeholder, not a grey box. A picture that does not show anything is worse
 * than no picture, and forcing an image into every slot is how a product page
 * ends up illustrated with stock photographs of people pointing at laptops.
 *
 * A point whose media key does not resolve behaves the same way. That is the
 * common case right now: none of the recordings exist yet, so a mistyped key
 * degrades to clean text rather than to a broken frame.
 *
 * Server component. The frames here are stills or animations that play on their
 * own — nothing on this section needs JavaScript.
 */

export interface ToolStoryProps {
  points: ToolStoryPoint[];
  slots: MediaSlot[];
}

export function ToolStory({ points, slots }: ToolStoryProps) {
  return (
    <section className="n15-sec" aria-labelledby="story-h">
      <div className="n15-in">
        <h2 id="story-h" className="n15-h2">
          What it does for you.
        </h2>

        <div className="ts-list">
          {points.map((point, i) => {
            const media = mediaSlotByKey(slots, point.mediaKey);
            return (
              <article
                key={point.head}
                className={'ts-row' + (i % 2 === 1 ? ' ts-row-flip' : '') + (media ? '' : ' ts-row-plain')}
              >
                <div className="ts-text">
                  <h3 className="n15-h3">{point.head}</h3>
                  <p className="n15-body n15-after">{point.body}</p>
                </div>

                {media && (
                  <figure className="ts-media">
                    {/* Plain <img> for the same reason as the gallery: several of
                        these are animations, and the optimizer flattens those to
                        a single frame. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={media.src} alt={media.alt} loading="lazy" decoding="async" />
                  </figure>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
