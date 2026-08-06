import { TickStrip } from '@/components/ui/Tick';

/**
 * components/marketing/ProofOfFlexibility.tsx.
 *
 * Three verticals, presented as a roadmap being walked rather than a
 * finished catalogue — epoxy is live, the other two are registered stubs
 * today (lib/verticals/painting/index.tsx, Phase 1) that prove the registry
 * contract holds without a core rewrite. Overstating that as "we already
 * serve every trade" would be exactly the kind of claim this build's own
 * copy rules forbid (OFFER.md §8: "never a lead-count promise," and by the
 * same logic, never an availability promise for a trade this instance
 * doesn't actually price yet).
 */
const TRADES = [
  { name: 'Concrete & epoxy coating', status: 'Live now' },
  { name: 'Residential painting', status: 'Built on request' },
  { name: 'Roofing, decking, and more', status: 'Same system, new module' },
];

export function ProofOfFlexibility() {
  return (
    <section className="border-y bg-sheet py-16">
      <div className="mx-auto max-w-4xl px-4">
        <TickStrip count={40} />
        <h2 className="mt-6 font-display font-condensed text-2xl font-bold sm:text-3xl">
          Built for one trade. Not limited to it.
        </h2>
        <p className="mt-2 max-w-xl text-base text-rule">
          The pricing logic, the photo analysis, and the lead capture are all built once and
          registered per trade — adding a new one is configuration, not a rebuild.
        </p>
        <dl className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {TRADES.map((t) => (
            <div key={t.name} className="rounded-milled border bg-concrete p-4">
              <dt className="font-display font-condensed text-base font-bold uppercase tracking-wide">
                {t.name}
              </dt>
              <dd className="mt-1 font-data text-sm text-rule">{t.status}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
