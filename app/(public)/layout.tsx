import type { ReactNode } from 'react';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Sections';

/**
 * app/(public)/layout.tsx — chrome for every public route.
 *
 * MotionProvider is gone from this layout. It was wrapping the whole public
 * tree so the marketing components could animate; 13B bans scroll-triggered
 * animation entirely and the homepage now ships no framer-motion at all. The
 * widget brings its own MotionProvider (see QuoteWidget), so routes that mount
 * it — /demo, /s/[slug] — are unaffected.
 *
 * pt-14 offsets the fixed 56px header. It is a padding on the wrapper rather
 * than a margin on each page so nothing can slide under the bar.
 *
 * ---------------------------------------------------------------------------
 * 15A.3 — THE ONE CHANGE HERE: `bg-concrete` became `public-ground`.
 *
 * THIS WAS A REAL BUG, AND THE GRADIENT FIELD HAS NOT BEEN VISIBLE SINCE 15A
 * SHIPPED. The field is `position: fixed; z-index: -1`. In CSS painting order a
 * negative-z-index element paints BEFORE the backgrounds of in-flow block
 * descendants — so this wrapper's opaque `bg-concrete` was painting straight
 * over it. Nobody noticed because the hero paints its own opaque media on top
 * and the legacy slab paints its own ground below, so the field had nothing
 * showing anyway.
 *
 * `.public-ground` (phase15a.css) is Cure Gray exactly as before, EXCEPT when
 * the subtree actually contains a field — `.public-ground:has(.gf)` goes
 * transparent and lets it through. Only the homepage mounts one, so only the
 * homepage changes. Every other public route — categories, pricing, demo,
 * queue, quote, checkout, the error and not-found pages — keeps the identical
 * opaque ground it has today. That is deliberate: those pages set ink text on
 * a light ground, and dropping them onto a dark field unreviewed would make
 * their copy unreadable. They join the field in 15B, when they are restyled.
 *
 * If :has() is unsupported the wrapper simply stays opaque and the page looks
 * exactly as it does now — the fallback is the current state, not a broken one.
 */

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-ground min-h-dvh">
      <Header />
      <main className="pt-14">{children}</main>
      <Footer />
    </div>
  );
}
