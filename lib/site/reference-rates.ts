import type { PricingRules } from '@/lib/quote/pricing';

/**
 * lib/site/reference-rates.ts — THE PUBLISHED CONFIGURATION.
 *
 * 13B section 4 publishes the pricing model on the public homepage. This is
 * the object it publishes, and it is the SAME object the hero calibration
 * check prices against, so the table on the page and the number in the widget
 * can never disagree. One constant, two consumers.
 *
 * PROVENANCE: these values mirror the epoxy quote_config seeded in seed.sql
 * for the Dallas reference tenant — flake $5.50, metallic $8.50, solid
 * polyaspartic $6.50 per sqft base, $1.50/sqft prep, three bounded condition
 * modifiers, $1,500 job minimum, $250 mobilisation, +/-15% band, 100-6000 sqft.
 *
 * WHY A CONSTANT AND NOT A QUERY. R-113 forbids rates living in TypeScript
 * inside the pricing kernel, and that rule is intact — lib/quote/pricing.ts
 * still reads every number from `rules`. This file is not the kernel; it is a
 * rules DOCUMENT, the public equivalent of one contractor's quote_config, and
 * it is passed INTO the kernel exactly like a tenant's own config is. Fetching
 * the seeded row instead would put a database round trip in the LCP path of
 * the one interaction the whole page exists to deliver, and would make the
 * hero fail closed during an outage.
 *
 * VERIFY: if the seeded epoxy rules in seed.sql change, change them here in
 * the same commit. These two are intentionally duplicated and must not drift.
 *
 * A contractor's own installed widget prices from HIS rules, not these. The
 * page says so in plain words rather than implying these are universal.
 */

export const REFERENCE_SQFT_MIN = 100;
export const REFERENCE_SQFT_MAX = 6000;

export const REFERENCE_RULES: PricingRules = {
  baseRateCentsPerSqft: {
    flake: 550,
    metallic: 850,
    solid_polyaspartic: 650,
  },
  prepRateCentsPerSqft: 150,
  conditionModifiers: [
    { id: 'oil_heavy', label: 'Heavy oil contamination', pctAdjust: 0.18 },
    { id: 'cracking_moderate', label: 'Moderate cracking repair', pctAdjust: 0.12 },
    { id: 'previous_coating', label: 'Previous coating removal', pctAdjust: 0.25 },
  ],
  minimumJobCents: 150000,
  mobilizationFeeCents: 25000,
  rangeSpreadPct: 0.15,
};

/** Finish tiers as the homeowner sees them, mapped to the rate keys above. */
export const REFERENCE_FINISHES: {
  id: string;
  label: string;
  tierKey: keyof typeof REFERENCE_RULES.baseRateCentsPerSqft;
}[] = [
  { id: 'decorative_flakes', label: 'Decorative flakes', tierKey: 'flake' },
  { id: 'metallic_epoxy', label: 'Metallic epoxy', tierKey: 'metallic' },
  { id: 'solid_polyaspartic', label: 'Solid polyaspartic', tierKey: 'solid_polyaspartic' },
];

/** $5.50 from 550. Whole dollars where the cents are zero. */
export function dollars(cents: number): string {
  const v = cents / 100;
  return Number.isInteger(v) ? `$${v.toLocaleString('en-US')}` : `$${v.toFixed(2)}`;
}

/** $2,640 — whole dollars only, for totals. */
export function wholeDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}
