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
 */

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-concrete">
      <Header />
      <main className="pt-14">{children}</main>
      <Footer />
    </div>
  );
}
