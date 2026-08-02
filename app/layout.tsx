import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

/**
 * FONTS CHANGED IN 13B. The two @fontsource imports that were here are gone:
 *
 *   import '@fontsource-variable/archivo/wdth.css';
 *   import '@fontsource/ibm-plex-mono/500.css';
 *
 * They shipped full latin character sets, could not be preloaded (the browser
 * only discovers the font once it has parsed the injected CSS), and served
 * Archivo as both display and body. All five faces are now self-hosted,
 * subsetted, and declared in globals.css. MEASURED total: 59.5 KB.
 *
 * The npm packages are left installed. Removing them is a package.json edit,
 * and package.json has not been pasted into this phase — nothing imports them
 * any more, so they cost bundle size only if something starts to.
 *
 * PRELOAD IS DELIBERATELY PARTIAL. Only the three faces that render above the
 * fold are preloaded: the headline weight, body, and mono for the Plate.
 * Preloading all five would put 60 KB of competing high-priority requests in
 * front of LCP on 4G, which is the opposite of the intent.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nva.digital';

export const metadata: Metadata = {
  // VERIFY: metadataBase decides how relative OG image paths resolve to
  // absolute URLs. The fallback below is a guess at the production domain.
  // Set NEXT_PUBLIC_SITE_URL in Vercel, or correct the literal, before these
  // links get pasted into a DM — an unresolvable OG URL renders a bare link.
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Girder — instant floor quotes that book jobs',
    template: '%s · Girder',
  },
  description:
    'The system that turns the people already looking at your site into booked jobs.',
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
  // data-theme in the SERVER HTML = zero flash of unthemed content.
  // Full strategy documented at the top of globals.css.
  return (
    <html lang="en" data-theme="light">
      <head>
        <link
          rel="preload"
          href="/fonts/archivo-800.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/plex-sans-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/plex-mono-500.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
