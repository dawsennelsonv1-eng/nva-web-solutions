import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getSiteTheme } from '@/lib/site/theme';
import './globals.css';
import './phase15a.css';
import './phase15b.css';
import './phase15c.css';
import './phase16.css';
import './phase17.css';
import './phase18.css';

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
 *   phase16.css   tool pages: gallery, story, similar tools, CTA rail. UNTOUCHED.
 *   phase18.css   the photo-first card (16C). Light overrides at its foot.
 *   phase17.css   the LIGHT THEME. Every rule scoped to
 *                 html[data-n15-theme='light'], so it is inert on dark.
 *
 * THE THEME IS READ ON THE SERVER AND WRITTEN ONTO <html>. There is no flash of
 * the wrong theme, because the correct attribute is in the initial HTML — the
 * browser never paints one theme and then swaps. That is the whole reason this
 * is a server read and not a cookie or a localStorage lookup in a script tag.
 *
 * getSiteTheme() is cached and tag-invalidated (lib/site/theme.ts), so the
 * steady-state cost of this read across the whole site is zero queries. If the
 * settings table does not exist yet it returns 'light' and the site renders
 * normally — deploying this before running migration 0018 is safe.
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = await getSiteTheme();

  // TWO THEME ATTRIBUTES, AND THEY ARE NOT THE SAME THING.
  //
  //   data-theme="light"    the LEGACY token system. Governs admin, the widget,
  //                         and any public route still on the old styles. It is
  //                         hardcoded and does not follow the switch — flipping
  //                         the marketing site to dark must not restyle the
  //                         admin screens somebody is working in.
  //
  //   data-n15-theme        the 15A+ layer. This is the one the switch controls.
  return (
    <html lang="en" data-theme="light" data-n15-theme={theme}>
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
