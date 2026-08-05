'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { FinishPhoto } from '@/lib/site/finish-photos';

/**
 * components/site/FinishPhoto.tsx — one finish reference photograph, and the
 * thing that renders when the photograph is not there.
 *
 * ============================================================================
 * WHY THIS IS A COMPONENT AND NOT A BARE <Image>
 * ============================================================================
 *
 * The phase requires the page to render correctly with every image file
 * missing. A bare next/image pointing at an absent file does not do that: the
 * optimizer returns an error, the browser paints its own broken-image glyph,
 * and the finish selector — which is a PRICING CONTROL, not a gallery — fills
 * with torn-page icons. On a page whose entire argument is that it does not
 * overstate what exists, shipping visible breakage is worse than shipping
 * text.
 *
 * So failure is a designed state. `onError` swaps to a ruled plate carrying
 * the caption: a tick strip and the finish name, in the same tokens as
 * everything else. It reads as a labelled blank on a spec sheet, which is what
 * it is. The control keeps working the whole time, because the photograph was
 * never load-bearing for the interaction.
 *
 * ============================================================================
 * LCP
 * ============================================================================
 *
 * NOTHING HERE IS EVER `priority`, and there is no prop to make it so.
 *
 * The finish selector sits above the fold, so the instinct is to preload it.
 * That instinct is wrong here. The LCP element on this page is the headline —
 * fluid Archivo at up to 4rem, in the initial HTML, with its font preloaded in
 * the root layout. Adding three high-priority image requests would put them in
 * front of that font on a 4G connection and make the largest text on the page
 * paint later, degrading the exact metric the priority flag is meant to
 * protect. The images are small, they are not the largest element, and they
 * are allowed to arrive second.
 *
 * `sizes` is required rather than defaulted for the same reason: without it
 * next/image assumes 100vw and serves a phone the 800px source. Every call
 * site states the width it actually renders at.
 */

export interface FinishPhotoProps {
  photo: FinishPhoto;
  /**
   * The width this renders at, per breakpoint. REQUIRED — see the note above.
   * e.g. '(min-width: 640px) 180px, 30vw'
   */
  sizes: string;
  /** Print the caption under the frame. Off inside the compact selector,
   *  where the finish name is already the button's own label. */
  showCaption?: boolean;
}

export function FinishPhoto({ photo, sizes, showCaption = false }: FinishPhotoProps) {
  const [failed, setFailed] = useState(false);

  return (
    <figure className="m-0">
      <div className="relative aspect-[4/3] w-full overflow-hidden border border-rule bg-concrete">
        {failed ? (
          /* THE FALLBACK PLATE. Not an error message — a labelled blank. The
             contractor should read this as "photograph not supplied yet",
             which is true, rather than as "this page is broken". */
          <div className="absolute inset-0 flex flex-col justify-between p-2">
            <div aria-hidden className="flex items-end" style={{ gap: 'var(--tick-gap)' }}>
              {Array.from({ length: 8 }, (_, i) => (
                <span
                  key={i}
                  className="inline-block bg-rule"
                  style={{
                    width: 'var(--tick-w)',
                    height: i % 4 === 0 ? 'var(--tick-major)' : 'var(--tick-minor)',
                  }}
                />
              ))}
            </div>
            <span className="font-data text-2xs uppercase leading-3 tracking-[0.08em] text-rule">
              {photo.caption}
            </span>
          </div>
        ) : (
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes={sizes}
            loading="lazy"
            onError={() => setFailed(true)}
            className="object-cover"
          />
        )}
      </div>

      {/* The caption is not optional information. A finish photograph without
          the words "finish type" next to it is a portfolio shot, and this
          product does not have a portfolio. Inside the selector the button's
          own label carries the same words, which is the only case where
          printing it twice would be noise. */}
      {showCaption && (
        <figcaption className="mt-1.5 font-data text-2xs uppercase leading-4 tracking-[0.08em] text-rule">
          {photo.caption}
        </figcaption>
      )}
    </figure>
  );
}
