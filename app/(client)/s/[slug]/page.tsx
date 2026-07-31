import { notFound } from 'next/navigation';
import { Placeholder } from '@/components/ui/Placeholder';
import { brandOverrideStyle } from '@/lib/theme';
import { resolvePrototypeBySlug } from '@/lib/prototype';

/**
 * /s/[slug] — 404 semantics live HERE, not in edge middleware (unchanged
 * reasoning from Phase 1: a per-request DB round trip in middleware is the
 * wrong place for tenant resolution).
 *
 * PHASE 6 SCOPE, stated precisely: this swaps stubResolvePrototypeBySlug for
 * the real lib/prototype.ts resolver — items 5 and 6 of this phase's brief.
 * It deliberately does NOT mount the production QuoteWidget here. That is
 * Phase 8's job by this project's own plan (the comment this file has
 * carried since Phase 1 says so explicitly), and building it now — even
 * though the pieces are close at hand after Phase 5's widget work — would be
 * the same scope violation in the other direction as skipping this swap
 * would have been. What changes today: every value below is a REAL row from
 * Postgres, including a REAL entitlement decision computed by the SAME pure
 * function (decideEntitlement) the live product's can() calls. Phase 8 mounts
 * <QuoteWidget> against this exact data shape.
 */
export default async function PrototypePage({ params }: { params: { slug: string } }) {
  const resolved = await resolvePrototypeBySlug(params.slug, { mode: 'live' });
  if (!resolved) notFound();

  const { prototype, brandKit, templateConfig, quoteConfig, contractorName, contractorPhone, entitlement } =
    resolved;

  return (
    // THE THEME SCOPE: data-theme + inline brand vars in SERVER HTML = the
    // page is branded on first paint with no flash (strategy: globals.css).
    <div
      data-theme={templateConfig?.styleVariant ?? 'light'}
      style={brandOverrideStyle({ hazard: brandKit?.accentHex ?? undefined })}
      className="min-h-dvh bg-concrete text-ink"
    >
      <Placeholder
        name="Route: /s/[slug] (real data, Phase 6 — widget mount is Phase 8)"
        props={{
          slug: prototype.slug,
          vertical: prototype.vertical,
          contractorName,
          contractorPhone,
          styleVariant: templateConfig?.styleVariant ?? null,
          hasQuoteConfig: quoteConfig !== null,
          entitlement,
          note: 'entitlement computed by decideEntitlement() — the exact same pure function check.ts uses on every gated request, not a re-implementation',
        }}
      />
    </div>
  );
}
