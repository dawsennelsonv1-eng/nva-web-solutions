import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './phase15a.css';

/**
 * PHASE 15A. phase15a.css is imported AFTER globals.css and carries the whole
 * new visual layer — fonts, tokens, gradient field, hero. globals.css is
 * untouched: the paste of it in this phase was truncated mid-file, and admin,
 * the widget, and the legacy lower sections still depend on its tokens.
 *
 * PRELOADS CHANGED: the three Archivo/Plex preloads are gone. Those faces
 * still exist in public/fonts and are still declared in globals.css for the
 * legacy sections and admin — they now load on demand with font-display:
 * swap, which is correct for faces that no longer render above the fold.
 * Preloaded instead: the display serif (the LCP headline), Geist 400 (body)
 * and Geist 500 (eyebrow + CTA, both above the fold). Geist 600 is figures
 * only and nothing above the fold uses it, so it stays lazy — 57.6 KB of
 * preload total, in front of a text LCP.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nva.digital';

export const metadata: Metadata = {
  // VERIFY: metadataBase decides how relative OG image paths resolve to
  // absolute URLs. The fallback below is a guess at the production domain.
  // Set NEXT_PUBLIC_SITE_URL in Vercel, or correct the literal, before these
  // links get pasted into a DM — an unresolvable OG URL renders a bare link.
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Girder — AI implemented in your business',
    template: '%s · Girder',
  },
  description:
    'Quoting tools, visualizers, and custom software built for the specific problems of your trade.',
  openGraph: {
    siteName: 'Girder',
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
  },
  twitter: {
    card: 'summary',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // data-theme="light" stays: the legacy token system still governs admin,
  // the widget, and the lower public sections until 15B. The 15A layer is
  // namespaced (--n15-*) and does not read data-theme.
  return (
    <html lang="en" data-theme="light">
      <head>
        <link
          rel="preload"
          href="/fonts/instrument-serif-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/geist-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/geist-500.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
