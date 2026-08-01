import type { ReactNode } from 'react';
import { resolvePrototypeBySlug } from '@/lib/prototype';
import { tokensToCssVars, type DerivedTokens } from '@/lib/brand/tokens';

/**
 * app/(client)/s/[slug]/layout.tsx — BRAND INJECTION AT FIRST PAINT.
 *
 * WHY A SLUG-SCOPED LAYOUT RATHER THAN app/(client)/layout.tsx, which is
 * what the brief names: a route-GROUP layout has no access to [slug]. Its
 * path contains no dynamic segment, so it receives no params and cannot
 * know whose brand to apply. A slug-scoped layout does receive them. This
 * is the same file in spirit — the (client) group layout still provides
 * motion context — moved to the only level in the tree where the tenant is
 * actually knowable.
 *
 * It is also strictly better than injecting in page.tsx (where Phase 1 put
 * the theme scope): a layout wraps loading.tsx and error.tsx too, so a
 * branded page that throws renders its error state INSIDE the contractor's
 * brand rather than snapping back to house colours mid-failure.
 *
 * The tokens land as inline CSS custom properties in the SERVER HTML, in
 * the "R G B" triplet form globals.css expects — so /s/[slug] is branded
 * before any JavaScript runs, with no flash. That is the Phase 1 no-flash
 * strategy, now fed by real per-tenant values.
 *
 * resolvePrototypeBySlug is React-cache()'d, so this call and the page's
 * are ONE query.
 */
export default async function PrototypeBrandLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { slug: string };
}) {
  const resolved = await resolvePrototypeBySlug(params.slug, { mode: 'live' });

  // No prototype: render children unstyled and let the page's own notFound()
  // produce the 404. A layout must not 404 on its own — that would make an
  // expired link fail before the page could show its designed expired state
  // (which Phase 8 builds and which still sells).
  if (!resolved) return <>{children}</>;

  const variant = resolved.templateConfig?.styleVariant ?? 'light';
  const derived = resolved.brandKit?.derivedTokens as DerivedTokens | null;

  // Prefer the full derived token set (Phase 7). Fall back to the raw accent
  // hex for kits saved before this phase, and to nothing at all if neither
  // exists — in which case the house tokens in globals.css apply unchanged,
  // which is a correct, good-looking page rather than a broken one.
  const style: Record<string, string> = derived
    ? tokensToCssVars(variant === 'dark-industrial' ? derived.dark : derived.light)
    : {};

  return (
    <div data-theme={variant} style={style} className="min-h-dvh bg-concrete text-ink">
      {children}
    </div>
  );
}
