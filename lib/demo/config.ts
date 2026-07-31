import { ensureVerticalsRegistered } from '@/lib/verticals/manifest';
import { getVertical } from '@/lib/verticals/registry';
import type { PricingRules } from '@/lib/quote/pricing';

/**
 * lib/demo/config.ts — the pricing config for /demo and the public-hub hero.
 *
 * WHY THIS IS CODE, NOT A DATABASE ROW: quote_configs are keyed by
 * prototype_id (0001_init.sql), and the demo is deliberately not attached to
 * any real prospect's prototype — DATA_MODEL.md is explicit that a null
 * prototype_id on leads/quotes means "/demo lead, OUR inbound." A demo
 * quote_config would need a real prototype row to hang off, which would mean
 * either inventing a fake tenant or borrowing a real one — the latter risks a
 * contractor's own catalogue changing what visitors see on our marketing
 * site. A constant is the correct home for this.
 *
 * THE NUMBERS ARE NOT INVENTED: they are the exact rule set seeded for
 * Ramirez Epoxy Coatings in supabase/seed.sql, which is also the literal
 * fixture lib/quote/pricing.test.ts asserts against line by line. The demo is
 * therefore provably priced correctly by the same suite that proves the
 * pricing engine itself is correct — not a second, unverified set of numbers.
 *
 * surfaceTypes and finishes are read from the real epoxy vertical module
 * rather than duplicated here, so the marketing site and the product speak
 * from one catalogue.
 */

export const DEMO_VERTICAL = 'epoxy';

export const DEMO_CONTRACTOR = {
  name: 'Anchor Point Epoxy',
  // A NANP-reserved fictional exchange (555) — recognisably a demo number,
  // never a real line that could actually ring.
  phone: '+12145550142',
};

export const DEMO_RULES: PricingRules = {
  baseRateCentsPerSqft: { flake: 550, metallic: 850, solid_polyaspartic: 650 },
  prepRateCentsPerSqft: 150,
  conditionModifiers: [
    { id: 'oil_heavy', label: 'Heavy oil contamination', pctAdjust: 0.18 },
    { id: 'cracking_moderate', label: 'Moderate cracking repair', pctAdjust: 0.12 },
    { id: 'previous_coating', label: 'Previous coating removal', pctAdjust: 0.25 },
  ],
  minimumJobCents: 150_000,
  mobilizationFeeCents: 25_000,
  rangeSpreadPct: 0.15,
};

export const DEMO_SQFT_MIN = 100;
export const DEMO_SQFT_MAX = 6000;

export function getDemoWidgetCatalogue() {
  ensureVerticalsRegistered();
  const vertical = getVertical(DEMO_VERTICAL);
  return {
    step1Question: vertical.copy.step1Question,
    surfaceTypes: vertical.surfaceTypes,
    finishes: vertical.finishCatalogue.map((f) => ({
      id: f.id,
      label: f.label,
      tierKey: f.tierKey,
      colours: f.colours,
    })),
    conditionModifiers: DEMO_RULES.conditionModifiers.map((m) => ({ id: m.id, label: m.label })),
  };
}
