import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolvePrototypeBySlug } from '@/lib/prototype';
import { getLogoPublicUrl } from '@/lib/storage/logos';
import { PrototypeView } from '@/components/prototype/PrototypeView';
import { ExpiredState } from '@/components/prototype/ExpiredState';

/**
 * app/(client)/s/[slug]/page.tsx — THE PUPPY DOG (public route).
 *
 * PHASE 9: the presentational body moved to components/prototype/
 * PrototypeView.tsx so the combiner's live preview route
 * (app/(client)/s/preview/[prototypeId]/page.tsx) can render the identical
 * component fed from staged data. This file's only job now is resolving
 * the REAL, SAVED prototype by slug and generating its metadata — the LCP
 * and code-splitting properties from Phase 8 are unchanged, since they live
 * in PrototypeView/LaunchGate, not here.
 */

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const resolution = await resolvePrototypeBySlug(params.slug);

  if (resolution.status === 'expired') {
    return { title: resolution.contractorName + ' — link expired', robots: { index: false, follow: false } };
  }
  if (resolution.status !== 'ok') {
    return { title: 'Not found', robots: { index: false, follow: false } };
  }

  const { contractorName, contractorCity, brandKit } = resolution.data;
  const marketLine = contractorCity ? 'Instant floor quotes in ' + contractorCity : 'Instant floor quotes';
  const logoUrl = brandKit?.logoPath ? getLogoPublicUrl(brandKit.logoPath) : null;

  return {
    title: contractorName,
    description: marketLine + '. Price your floor in under a minute.',
    robots: { index: false, follow: false },
    openGraph: {
      title: contractorName,
      description: marketLine,
      type: 'website',
      ...(logoUrl ? { images: [{ url: logoUrl }] } : {}),
    },
    twitter: {
      card: logoUrl ? 'summary' : 'summary_large_image',
      title: contractorName,
      description: marketLine,
    },
  };
}

export default async function PrototypePage({ params }: { params: { slug: string } }) {
  const resolution = await resolvePrototypeBySlug(params.slug);

  if (resolution.status === 'not_found') notFound();
  if (resolution.status === 'expired') {
    return <ExpiredState contractorName={resolution.contractorName} slug={resolution.slug} />;
  }

  return <PrototypeView resolved={resolution.data} />;
}
