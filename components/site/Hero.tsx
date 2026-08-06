'use client';

import Image from 'next/image';
import Link from 'next/link';
import { HeroCycle } from './HeroCycle';

/**
 * components/site/Hero.tsx — Phase 15A, Part 3: the full-bleed banner.
 *
 * Structure, back to front:
 *   1. Media — the photograph (or the gradient placeholder until it exists),
 *      inside two nested layers: an outer parallax wrapper driven by the
 *      --n15-x/--n15-y input variables, and an inner layer running the slow
 *      26s scale drift. Nested because a variable transform and a keyframe
 *      transform on one element would fight.
 *   2. Scrim — vertical legibility gradient plus a pool of darkness centred
 *      behind the type. Daylight legibility does not depend on the photo.
 *   3. Content — fixed eyebrow, the cycling serif line (height reserved),
 *      one supporting sentence, one CTA that never moves.
 *
 * THE PHOTOGRAPH IS IN (15A.5). public/hero/floor-master.jpg — the supplied
 * shot, cropped to 3:2 and graded: exposure pulled down, the cyan cast
 * desaturated and split-toned toward the palette (copper in the light, resin
 * blue in the dark), a copper wash low-right, an elliptical vignette, and an
 * extra soft pool of darkness where the headline lands.
 *
 * MEASURED, not guessed: the source averaged 142/255 luminance, which no
 * amount of scrim makes safe for white type. The graded file averages 49, and
 * 69 across the centre band where the type sits. With the softened scrim in
 * phase15a.css that lands the type background near 42 against #F4F2ED text —
 * roughly 12:1, which holds in direct sunlight.
 *
 * 2400×1600, q78 progressive, 311 KB on disk. next/image serves it resized as
 * AVIF/WebP per device from this master, so a phone pulls a fraction of that.
 *
 * COMPOSITION SURVIVES THE PHONE CROP, which is the constraint that decided
 * the crop: the hero box is portrait at 360px, so object-fit centre-crops
 * hard. The corridor is symmetric and recedes centrally, so the portrait crop
 * still reads as a corridor rather than a slice of wall.
 *
 * BLUR PLACEHOLDER: a 24px inline LQIP, ~0.9 KB of base64 in the HTML. It
 * paints instantly and the photo resolves into it, so there is never an empty
 * black rectangle on a slow connection. It costs one network round trip less
 * than a separate placeholder file.
 *
 * The gradient placeholder (.hero-ph) stays in the CSS as the fallback for
 * HERO_IMG = null. It costs nothing and it is what the hero falls back to if
 * the file is ever moved.
 */

const HERO_IMG: string | null = '/hero/floor-master.jpg';

const HERO_BLUR =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABMNDhEODBMRDxEVFBMXHTAfHRoaHToqLCMwRT1JR0Q9Q0FMVm1dTFFoUkFDX4JgaHF1e3x7SlyGkIV3j214e3b/2wBDARQVFR0ZHTgfHzh2T0NPdnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnb/wAARCAAQABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDm0gJDLj5tvA9PrSpa4iAKqWx19KfbXCgbVUBfr1qf7RB3NAihJCUUBgAcfnRVmeZNpX5SKKLjsf/Z';

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-h">
      <div className="hero-media" aria-hidden="true">
        <div className="hero-media-par">
          <div className="hero-media-zoom">
            {HERO_IMG ? (
              <Image
                src={HERO_IMG}
                alt=""
                fill
                priority
                sizes="100vw"
                quality={70}
                placeholder="blur"
                blurDataURL={HERO_BLUR}
                className="hero-img"
              />
            ) : (
              <div className="hero-ph" />
            )}
          </div>
        </div>
        <div className="hero-scrim" />
      </div>

      <div className="hero-inner">
        <p className="hero-eyebrow">NVA Digital Solutions</p>
        <h1 id="hero-h" className="hero-h">
          <HeroCycle />
        </h1>
        <p className="hero-sub">
          We implement AI in your business — quoting tools, visualizers, and
          custom software built for the specific problems of your trade.
        </p>
        <Link href="/categories" className="hero-cta">
          Explore the tools
        </Link>
      </div>
    </section>
  );
}
