import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './phase15a.css';
import './phase15b.css';
import './phase15c.css';
import './phase16.css';

/**
 * PHASE 16B. phase16.css is imported LAST and carries the tool page template.
 *
 * THE IMPORT ORDER IS THE WHOLE MECHANISM and it is deliberate. Each file adds
 * and none of them override the one above:
 *   globals.css   legacy tokens. Still governs admin, the widget, and the
 *                 public routes not yet restyled. UNTOUCHED.
 *   phase15a.css  fonts, --n15-* tokens, the gradient field, the hero. UNTOUCHED.
 *   phase15b.css  homepage: cards, tilt, restyled sections, header, footer.
 *                 UNTOUCHED BY 15C.
 *   phase15c.css  about, support, privacy, terms, error, not-found. UNTOUCHED.
 *   phase16.css   tool pages: gallery, story, similar tools, CTA rail.
 *
 * Nothing in 15B is a Tailwind class, so tailwind.config.ts is unchanged and no
 * legacy surface moves.
 *
 * PRELOADS: unchanged from 15A, and deliberately so. The LCP element is still
 * the hero headline in Instrument Serif; Geist 400 and 500 carry body and UI
 * above the fold. Geist 600 is figures only — the price band on the tool cards
 * is well below the fold on a phone, so it stays lazy rather than adding 17 KB
 * in front of a text LCP. 57.6 KB of preload total.
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
  // data-theme="light" stays: the legacy token system still governs admin, the
  // widget, and every public route other than the homepage. The 15A/15B layers
  // are namespaced (--n15-*) and do not read data-theme.
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
