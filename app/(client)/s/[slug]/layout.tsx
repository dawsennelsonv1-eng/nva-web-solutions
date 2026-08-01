import type { ReactNode } from 'react';
import { resolvePrototypeBySlug } from '@/lib/prototype';
import { tokensToCssVars, type DerivedTokens } from '@/lib/brand/tokens';

/**
 * app/(client)/s/[slug]/layout.tsx — BRAND INJECTION AT FIRST PAINT.
 *
 * Unchanged reasoning from Phase 7: a route-GROUP layout has no [slug], so
 * this stays slug-scoped. Updated for Phase 8's discriminated resolution
 * type — only an 'ok' result gets the theme scope and brand variables; an
 * expired link renders in house colours (a contractor's OLD colours on a
 * page telling him it doesn't work would read as broken, not current), and
 * not_found falls through to notFound()'s own boundary, whose styling
 * lives entirely in app/(client)/not-found.tsx.
 *
 * resolvePrototypeBySlug is React cache()'d — this call, generateMetadata's,
 * and the page's are ONE query per request.
 */
export default async function PrototypeBrandLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { slug: string };
}) {
  const resolution = await resolvePrototypeBySlug(params.slug);

  if (resolution.status !== 'ok') {
    return <>{children}</>;
  }

  const resolved = resolution.data;
  const variant = resolved.templateConfig?.styleVariant ?? 'light';
  const derived = resolved.brandKit?.derivedTokens as DerivedTokens | null;

  const style: Record<string, string> = derived
    ? tokensToCssVars(variant === 'dark-industrial' ? derived.dark : derived.light)
    : {};

  return (
    <div data-theme={variant} style={style} className="min-h-dvh bg-concrete text-ink">
      {children}
    </div>
  );
}
