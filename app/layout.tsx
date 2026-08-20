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
import './phase19.css';
import './phase20.css';
import './phase21.css';
import './phase22.css';
import './phase23.css';
import './phase24.css';
import './phase25.css';
import './phase26.css';
import './phase27.css';
import './phase28.css';
import './phase29.css';
import './phase30.css';
import './phase31.css';
import './phase32.css';
import './phase33.css';
/**
 * PHASE 34 — layout stability and desktop width. Registered LAST because it is
 * the only layer that deliberately redefines a selector an earlier one owns:
 * `.n15-in`'s max-width, inside a `min-width: 1200px` query. That override is
 * argued for at the rule itself and cannot fire below 1200px, so every
 * viewport the site has been designed against renders unchanged.
 *
 * It declares no colour, so unlike phase18-33 it needs no light-theme block.
 */
import './phase34.css';

/**
 * PHASE 35 — the pictures get their space back. Registered after phase34.
 *
 * ADDITIONS ONLY, and it is worth being precise about how that was achieved,
 * because the obvious implementation would have broken the rule. The gallery's
 * size is set by `.mg-stage` in phase16.css and narrowed again by
 * `.tc-gallery .mg-stage` in phase18.css; the picker's preview is capped at
 * 32vh by `.fp-hero-img` in phase30.css. Every one of those is imported before
 * this file and owned by its own layer, so there is no legal way to enlarge
 * them from here.
 *
 * Rather than redefine them, the two components were changed to ask for NEW
 * names — `.rv-*` and `.fp-stage*` — which this layer styles from nothing. The
 * old rules are untouched and simply stop matching. Same move phase26.css made
 * with `.tc-gallery-lead`.
 *
 * It declares no themed colour beyond `--n15-*` tokens and `currentColor`, so
 * like phase29, phase30 and phase33 it needs no light-theme block. The single
 * hardcoded colour is the full-screen viewer's backdrop, argued for at the
 * rule itself.
 */
import './phase35.css';

/**
 * PHASE 58 — the expand affordance on the photo review grid.
 *
 * ONE RULE, `.tc-pick .lb-open`, and it is registered here rather than
 * appended to phase27.css or phase35.css because it belongs to neither: it
 * styles the point where the review grid (phase27) and the full-screen viewer
 * (phase35) meet, and putting it in either file would give one layer an
 * opinion about a class the other owns.
 *
 * It declares no colour, so like phase34.css it carries no
 * html[data-n15-theme='light'] block. See the note below on why that is the
 * requirement and not an option.
 */
import './phase58.css';

/**
 * PHASE 59 — width constraints on the tool card and its media.
 *
 * Registered last. It declares no colour, so like phase34 and phase58 it
 * carries no light-theme block.
 *
 * It is deliberately a CLAMP rather than a targeted fix: the element causing
 * the homepage overflow was never measured, so every rule in it can only make
 * something narrower and is inert if the cause lies elsewhere. The file says
 * so at its head, and says what to do instead. If the probe is ever run and
 * names the element, this layer should be replaced rather than added to.
 */
import './phase59.css';

/**
 * PHASE 62 — the combination preview at full size, and every picture whole.
 *
 * Defines `.fp-stage-shot` and `.fp-sw-shot`, two class names that exist only
 * here. It follows the precedent phase35 set when it superseded phase30's
 * `.fp-hero-*`: new names rather than rewriting an earlier layer's rules, so
 * `.fp-stage-img` keeps governing the video branch and the borders untouched.
 *
 * No colour, so no light-theme block.
 */
import './phase62.css';

/**
 * PHASE 64 — the mix list moves below the preview.
 *
 * Defines `.fp-stage-lean` and `.fp-under*`. It overrides only the two
 * shape properties on `.fp-stage-none`, through a compound selector that
 * cannot fire unless the component adds the new class, so phase35's rule is
 * intact for anything still using it alone.
 *
 * No colour, so no light-theme block.
 */
import './phase64.css';

/**
 * PHASE 80 - the property tap map.
 *
 * Declares colour without a light-theme block, which is allowed here for the
 * same reason phase35 gave `.lb-open` a theme-independent treatment: these
 * elements sit on a satellite photograph rather than on a panel, and the
 * backdrop is the same aerial image in either theme. Text that sits on the page
 * rather than the image uses currentColor and inherits normally.
 */
import './phase80.css';

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
 *   phase19.css   account links in the menu (16F). Light overrides at its foot.
 *   phase20.css   /categories and /pricing (16G). Light overrides at its foot.
 *   phase21.css   /queue and the build log (16H). Light overrides at its foot.
 *   phase22.css   vote form and concierge (16I). Light overrides at its foot.
 *   phase24.css   the tool directory (17C). Light overrides at its foot.
 *   phase25.css   the tool page (17D). Light overrides at its foot.
 *   phase26.css   the gallery-first card. Adds .tc-gallery-lead and a stacked
 *                 .tc-actions below 30rem. Introduces no selector that any
 *                 earlier layer already defines.
 *   phase27.css   the photo review grid and the measurement provenance line.
 *                 All new names; phase18.css keeps the rest of the card.
 *   phase28.css   the contact gate and the locked price plate. Everything is
 *                 prefixed .cg- or .tc-locked.
 *   phase29.css   the member dashboard, brought onto this system at last.
 *                 Everything is prefixed .mb-.
 *   phase30.css   the customisation picker. Everything is prefixed .fp-.
 *   phase31.css   the results block: render, price and specification.
 *   phase32.css   the specification on a dashboard lead. Prefixed .mb-lead-.
 *   phase33.css   the operator upload control in the picker. Prefixed .cu-.
 *   phase23.css   the spec sheet (16J). The last public route off the legacy
 *                 token system. Light overrides at its foot.
 *   phase17.css   the LIGHT THEME. Every rule scoped to
 *                 html[data-n15-theme='light'], so it is inert on dark.
 *
 * READ THE IMPORT LIST ABOVE, NOT THE ORDER OF THIS TABLE.
 *
 * This listing puts phase17 at the bottom, which reads as "the light theme is
 * imported last and therefore wins". IT IS NOT. phase17.css is imported SIXTH,
 * immediately after phase16 — so it can only reach selectors that existed at
 * that point, and every layer from phase18 onward carries its OWN light
 * overrides at its foot for exactly that reason.
 *
 * The distinction cost real time during phase 3: a new layer written on the
 * assumption that phase17 would retint it afterwards would render correctly on
 * dark and wrongly on light, with nothing in this comment to suggest why.
 *
 * A NEW LAYER MUST EITHER declare no colour at all (phase34.css takes this
 * route) OR carry its own html[data-n15-theme='light'] block at its foot.
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

