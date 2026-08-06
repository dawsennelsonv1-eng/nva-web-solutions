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
 * THE PHOTOGRAPH: set HERO_IMG to the public path when it arrives, e.g.
 *   const HERO_IMG: string | null = '/hero/floor-master.jpg';
 * That one line is the entire swap. next/image with priority + sizes="100vw"
 * lets Vercel's optimizer serve resized AVIF/WebP per device — no local
 * tooling needed, drop the original JPEG in public/hero/ and push.
 *
 * Until then the placeholder renders a lit resin-floor composition built
 * from gradients (see .hero-ph). It is a designed surface, not a grey box.
 */

const HERO_IMG: string | null = null;

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
