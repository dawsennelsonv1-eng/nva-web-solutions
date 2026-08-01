import { notFound } from 'next/navigation';
import { Placeholder } from '@/components/ui/Placeholder';
import { resolvePrototypeBySlug } from '@/lib/prototype';
import type { DerivedTokens } from '@/lib/brand/tokens';

/**
 * /s/[slug] — 404 semantics still live HERE, not in edge middleware
 * (unchanged reasoning since Phase 1).
 *
 * PHASE 7 CHANGE: the theme scope and brand CSS variables moved UP to
 * ./layout.tsx, which is the only level that both knows the tenant and
 * wraps the error/loading states. This page is now purely content. The
 * resolve call is shared with the layout via React cache() — still one
 * query.
 *
 * The full widget mount remains Phase 8's job, as it was in Phase 6.
 */
export default async function PrototypePage({ params }: { params: { slug: string } }) {
  const resolved = await resolvePrototypeBySlug(params.slug, { mode: 'live' });
  if (!resolved) notFound();

  const { prototype, brandKit, templateConfig, quoteConfig, contractorName, contractorPhone, entitlement } =
    resolved;
  const derived = brandKit?.derivedTokens as DerivedTokens | null;

  return (
    <Placeholder
      name="Route: /s/[slug] (branded via layout — widget mount is Phase 8)"
      props={{
        slug: prototype.slug,
        vertical: prototype.vertical,
        contractorName,
        contractorPhone,
        styleVariant: templateConfig?.styleVariant ?? null,
        hasQuoteConfig: quoteConfig !== null,
        brand: derived
          ? {
              source: 'derived_tokens',
              hazard: derived.light?.hazard ?? null,
              adjustments: derived.adjustments?.length ?? 0,
              provenance: derived.provenance ?? null,
            }
          : { source: brandKit?.accentHex ? 'raw_accent_hex' : 'house_defaults' },
        entitlement,
      }}
    />
  );
}
