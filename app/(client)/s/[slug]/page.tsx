import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolvePrototypeBySlug } from '@/lib/prototype';
import { getLogoPublicUrl } from '@/lib/storage/logos';
import { ensureVerticalsRegistered } from '@/lib/verticals/manifest';
import { getVertical } from '@/lib/verticals/registry';
import { LaunchGate } from '@/components/prototype/LaunchGate';
import { PurchaseCta } from '@/components/prototype/PurchaseCta';
import { ExpiredState } from '@/components/prototype/ExpiredState';
import { StyleToggleWithTracking } from '@/components/prototype/StyleToggleWithTracking';

/**
 * app/(client)/s/[slug]/page.tsx — THE PUPPY DOG.
 *
 * "He is skeptical, on a truck's mobile signal, and will give it about ten
 * seconds." Every structural choice below answers to that sentence:
 *
 *   - The hero (headline, orientation line) is plain server-rendered HTML.
 *     No client component sits between the request and that content — it
 *     is the LCP element, and nothing blocks it.
 *   - The widget itself is not even IMPORTED until LaunchGate's button is
 *     tapped (see that file). This page ships zero widget JavaScript.
 *   - The purchase CTA sits immediately after the launch point in DOM
 *     order, so scrolling down from a completed test reaches it directly —
 *     "reachable the instant he finishes testing" (item 5) is a layout
 *     decision, not a modal or a sticky-scroll trick.
 *   - StyleToggleWithTracking is a small separate client component, so the
 *     toggle's own minor cost is isolated from LaunchGate's much larger
 *     deferred widget bundle rather than pulling both in together.
 *
 * MODE COMES FROM THE RESOLVER, NOT A PROP: lib/prototype.ts derives
 * 'prototype' vs 'live' from whether a subscription exists (Phase 8
 * correction to that file). This page never decides that itself.
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
    robots: { index: false, follow: false }, // a prospect's private preview, not a public listing
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

  const {
    prototype, brandKit, templateConfig, quoteConfig,
    contractorName, contractorPhone, contractorEmail, contractorCity, contractorState, prospectId,
    mode, entitlement,
  } = resolution.data;

  ensureVerticalsRegistered();
  const vertical = getVertical(prototype.vertical);
  const marketLine = contractorCity
    ? vertical.copy.tradeNoun + ' in ' + contractorCity + (contractorState ? ', ' + contractorState : '')
    : vertical.copy.tradeNoun;

  const logoUrl = brandKit?.logoPath ? getLogoPublicUrl(brandKit.logoPath) : null;
  const styleVariant = templateConfig?.styleVariant ?? 'light';
  const rawConditionModifiers =
    (quoteConfig?.rules as { conditionModifiers?: { id: string; label: string }[] } | undefined)
      ?.conditionModifiers ?? [];

  return (
    <div className="mx-auto max-w-md px-4 pb-16 pt-8">
      <header className="flex items-center justify-between">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={contractorName} className="h-10 max-w-[60%] object-contain object-left" />
        ) : (
          <p className="font-display font-condensed text-lg font-bold">{contractorName}</p>
        )}
        {contractorPhone ? (
          <a href={'tel:' + contractorPhone.replace(/[^\d+]/g, '')} className="font-data text-xs text-rule">
            {contractorPhone}
          </a>
        ) : null}
      </header>

      {/* First-visit orientation — one line, no modal, no tour. Always
          rendered rather than gated behind a "seen it before" check: on a
          phone call he may reopen the same link more than once, and each
          reopen is functionally a first look again. Server-rendered, zero
          client cost. */}
      <p className="mt-4 font-data text-xs uppercase tracking-wide text-hazard">
        This is a preview of your own site — nothing here is shared with anyone else yet.
      </p>

      <h1 className="mt-2 font-display font-condensed text-3xl font-bold leading-[1.05]">
        {contractorName}
      </h1>
      <p className="mt-1 text-base text-rule">Instant {marketLine} quotes, day or night.</p>

      <div className="mt-6">
        <LaunchGate
          prototypeId={prototype.id}
          surface="prototype"
          vertical={prototype.vertical}
          step1Question={vertical.copy.step1Question}
          contractorName={contractorName}
          contractorPhone={contractorPhone}
          sqftMin={quoteConfig?.sqftMin ?? 100}
          sqftMax={quoteConfig?.sqftMax ?? 6000}
          rules={quoteConfig?.rules ?? {}}
          finishes={vertical.finishCatalogue.map((f) => ({
            id: f.id, label: f.label, tierKey: f.tierKey, colours: f.colours,
          }))}
          surfaceTypes={vertical.surfaceTypes}
          conditionModifiers={rawConditionModifiers.map((m) => ({ id: m.id, label: m.label }))}
          styleVariant={styleVariant}
          initialDegraded={{ degraded: entitlement.degraded, reason: entitlement.degradedReason }}
        />
      </div>

      {/* THE STYLE TOGGLE — proof of flexibility, not a settings panel.
          Framed with one line; the toggle component itself (Phase 4) is
          unmodified — StyleToggleWithTracking only adds an analytics call
          on its existing onChange prop. */}
      {mode !== 'live' ? (
        <div className="mt-6 rounded-milled border bg-sheet p-3">
          <p className="font-data text-xs text-rule">
            Same site, two looks — this is what &quot;built for your brand&quot; actually means.
          </p>
          <StyleToggleWithTracking prototypeId={prototype.id} initial={styleVariant} />
        </div>
      ) : null}

      <div className="mt-8">
        <PurchaseCta prospectId={prospectId} prototypeId={prototype.id} contractorEmail={contractorEmail} />
      </div>
    </div>
  );
}
