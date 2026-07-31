import { notFound } from 'next/navigation';
import { Placeholder } from '@/components/ui/Placeholder';
import { brandOverrideStyle } from '@/lib/theme';
import { stubResolvePrototypeBySlug } from '@/lib/stubs';

/**
 * /s/[slug] — 404 semantics live HERE, not in edge middleware:
 * a per-request DB round-trip in middleware is the wrong place for tenant
 * resolution (latency on every matched request, service coupling in edge).
 * The route resolves the prototype; anything not ACTIVE ('live') is
 * notFound(). Phase 6 swaps stubResolvePrototypeBySlug for the real
 * one-query resolver in lib/prototype.ts — the route does not change.
 */
export default function PrototypePage({ params }: { params: { slug: string } }) {
  const resolved = stubResolvePrototypeBySlug(params.slug);
  if (!resolved) notFound();

  const { prototype, brandKit, templateConfig } = resolved;

  return (
    // THE THEME SCOPE: data-theme + inline brand vars in SERVER HTML = the
    // page is branded on first paint with no flash (strategy: globals.css).
    <div
      data-theme={templateConfig.styleVariant}
      style={brandOverrideStyle({ hazard: brandKit.accentHex })}
      className="min-h-dvh bg-concrete text-ink"
    >
      <Placeholder
        name="Route: /s/[slug] (client prototype — Phase 8)"
        props={{
          slug: prototype.slug,
          status: prototype.status,
          styleVariant: templateConfig.styleVariant,
          widgetMode: 'prototype',
          note: 'prototype mode NEVER consumes quota (R-124)',
        }}
      />
    </div>
  );
}
