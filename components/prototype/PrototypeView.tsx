import { getLogoPublicUrl } from '@/lib/storage/logos';
import { ensureVerticalsRegistered } from '@/lib/verticals/manifest';
import { getVertical } from '@/lib/verticals/registry';
import { LaunchGate } from './LaunchGate';
import { PurchaseCta } from './PurchaseCta';
import { StyleToggleWithTracking } from './StyleToggleWithTracking';
import type { ResolvedPrototype } from '@/lib/prototype';

/**
 * components/prototype/PrototypeView.tsx — Phase 9 extraction.
 *
 * This is the exact presentational body app/(client)/s/[slug]/page.tsx
 * rendered directly through Phase 8. Pulled out here so the combiner's live
 * preview can render THE ACTUAL PAGE — not a mock, not a screenshot, not a
 * second copy that could drift from what a real contractor sees — fed from
 * staged (unsaved) data instead of the persisted tables. Both
 * app/(client)/s/[slug]/page.tsx and app/(client)/s/preview/[prototypeId]/
 * page.tsx now call this same component; neither owns the rendering logic
 * itself anymore.
 *
 * `mode` is passed through unchanged from whatever resolved it (Phase 8's
 * derivation for the real route, always 'preview' for the staging route —
 * 'preview' mode writes nothing, anywhere, a guarantee that has held since
 * Phase 3's machine.ts and is exactly why the combiner's iframe is safe to
 * point at real interaction logic).
 */
export function PrototypeView({ resolved }: { resolved: ResolvedPrototype }) {
  const {
    prototype, brandKit, templateConfig, quoteConfig,
    contractorName, contractorPhone, contractorCity, contractorState,
    mode, entitlement,
  } = resolved;

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

      {mode !== 'live' ? (
        <div className="mt-6 rounded-milled border bg-sheet p-3">
          <p className="font-data text-xs text-rule">
            Same site, two looks — this is what &quot;built for your brand&quot; actually means.
          </p>
          <StyleToggleWithTracking prototypeId={prototype.id} initial={styleVariant} />
        </div>
      ) : null}

      {mode === 'preview' ? null : (
        <div className="mt-8">
          <PurchaseCta prospectId={resolved.prospectId} prototypeId={prototype.id} contractorEmail={resolved.contractorEmail} />
        </div>
      )}
    </div>
  );
}
