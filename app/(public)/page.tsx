import type { Metadata } from 'next';
import { GradientField } from '@/components/site/GradientField';
import { Hero } from '@/components/site/Hero';
import { ProofOfOperation } from '@/components/site/ProofOfOperation';
import { Showcase } from '@/components/site/Showcase';
import { Faq, Integration, Machinery, Terms } from '@/components/site/Sections';

/**
 * app/(public)/page.tsx — PHASE 15A. The industrial-instrument thesis is
 * cancelled; the page now opens on a full-bleed cinematic hero over a living
 * gradient field.
 *
 * WHAT LEFT THIS FILE:
 * - CalibrationCheck is UNMOUNTED, not deleted. The component is untouched at
 *   components/site/CalibrationCheck.tsx and remounts on the tool cards in
 *   15B. (If any OTHER file in the repo mounts it, that mount is unaffected —
 *   I can only see files pasted into the phase.)
 * - The Plate and liveInstalls() are unmounted with it: the hero no longer
 *   carries an equipment plate, and dropping the fetch makes the homepage
 *   fully static — it now serves straight from the Vercel edge cache, which
 *   is worth real milliseconds on the ad-click path. Both remain untouched on
 *   disk; the live count can return inside ProofOfOperation in 15B.
 * - Every franchise / $49,500 / royalty reference in THIS file and in the
 *   metadata. NOTE: Machinery and Terms below very likely still carry that
 *   copy internally — those files were not pasted, so they render as-is until
 *   15A.1. Same for /og.png, which may still show the old headline.
 *
 * THE LEGACY SLAB: Showcase through Faq still wear the old light system, so
 * they are parked on an explicit .bg-concrete wrapper. Without it they would
 * sit directly over the dark field and their ink text would vanish. 15B
 * rebuilds them onto the field properly; one deploy of visible seam between
 * hero and slab is expected and accepted.
 *
 * GradientField mounts here, so the field runs the full height of THIS page.
 * Making it site-wide (categories, pricing) needs the (public) layout — see
 * the phase notes.
 */

export const metadata: Metadata = {
  title: 'Girder — instant quotes and AI tools for your trade',
  description:
    'Your customer gets a price in under a minute — and sees their floor before they call. Quoting tools, visualizers, and custom software from NVA.',
  openGraph: {
    title: 'Girder — instant quotes and AI tools for your trade',
    description:
      'Your customer gets a price in under a minute — and sees their floor before they call.',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Girder' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Girder — instant quotes and AI tools for your trade',
    description:
      'Your customer gets a price in under a minute — and sees their floor before they call.',
    images: ['/og.png'],
  },
};

export default function HomePage() {
  return (
    <>
      <GradientField />
      <Hero />
      <div className="bg-concrete">
        <Showcase />
        <Integration />
        <Machinery />
        <ProofOfOperation />
        <Terms />
        <Faq />
      </div>
    </>
  );
}
