import type { Metadata } from 'next';
import type { ReactNode } from 'react';
// Self-hosted fonts via fontsource (npm-delivered, latin subsets, swap):
// Archivo Variable with the WIDTH axis — one file serves display AND body
// (DESIGN.md Pass 2.3); IBM Plex Mono 500 for every measured number.
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Girder — instant floor quotes that book jobs',
    template: '%s · Girder',
  },
  description:
    'The system that turns the people already looking at your site into booked jobs.',
  // Sitewide OG/Twitter defaults (Phase 5). Individual routes override title
  // and description via their own metadata export; Next merges the rest of
  // this object in as a fallback, so every route gets a correct link
  // preview even without repeating these fields.
  // VERIFY: no openGraph.images set — no brand image asset exists yet in
  // this build. A share preview without an image still renders correctly
  // (title + description), just without a thumbnail; add images here the
  // moment a real OG asset exists.
  openGraph: {
    siteName: 'Girder',
    type: 'website',
    locale: 'en_US',
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
      <body>{children}</body>
    </html>
  );
}
