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
