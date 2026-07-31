import type {
  BrandKit,
  Lead,
  Plan,
  Prospect,
  Prototype,
  TemplateConfig,
  UsageSnapshot,
} from '@/types';

/**
 * STUB DATA LAYER (Phase 1). Every route renders on a clean clone with no
 * database. Phase 6 replaces these reads with real queries one file at a
 * time; the shapes are the types/index.ts shapes, so the swap is mechanical.
 *
 * Nothing here is imported by lib/quote/*, lib/entitlements/check.ts, or any
 * billing path once those exist — stubs feed PLACEHOLDER PAGES only.
 */

/** A stable live slug so /s/<this> works on a clean deploy for smoke tests. */
export const STUB_LIVE_SLUG = 'demoramirezepoxy1';

export const stubPlans: Plan[] = [
  {
    code: 'foundation',
    name: 'Foundation',
    setupFeeCents: 50000,
    monthlyCents: 25000,
    analysisLimitPerMonth: 25,
    analysisLimitPerSession: 3,
    features: {
      'quote.deterministic': true,
      'quote.ai_analysis': true,
      'lead.capture': true,
      'quote.share_page': true,
      'brand.style_toggle': true,
      'cure.advisor': false,
      command_center: false,
      'ai.implementation_review': false,
    },
    isActive: true,
  },
  {
    code: 'operator',
    name: 'Operator',
    setupFeeCents: 250000,
    monthlyCents: 50000,
    analysisLimitPerMonth: null, // null = unlimited, by contract
    analysisLimitPerSession: 3,
    features: {
      'quote.deterministic': true,
      'quote.ai_analysis': true,
      'lead.capture': true,
      'quote.share_page': true,
      'brand.style_toggle': true,
      'cure.advisor': true,
      command_center: true,
      'ai.implementation_review': true,
    },
    isActive: true,
  },
];

export const stubProspect: Prospect = {
  id: 'stub-prospect-1',
  businessName: 'Ramirez Epoxy Coatings',
  contactName: 'Mike Ramirez',
  phone: '+12145550137',
  email: 'mike@example.com',
  city: 'Dallas',
  state: 'TX',
  websiteUrl: 'https://example.com',
  vertical: 'epoxy',
  status: 'pitched',
  qualificationScore: 75,
};

export const stubPrototype: Prototype = {
  id: 'stub-prototype-1',
  prospectId: stubProspect.id,
  slug: STUB_LIVE_SLUG,
  status: 'live',
  expiresAt: null,
  tier: 'foundation',
  subscriptionStatus: 'active',
  vertical: 'epoxy',
};

export const stubBrandKit: BrandKit = {
  prototypeId: stubPrototype.id,
  logoPath: null,
  primaryHex: '#1B4B8F',
  secondaryHex: '#14171A',
  accentHex: '#D96A1E',
  extractionSource: 'manual',
};

export const stubTemplateConfig: TemplateConfig = {
  prototypeId: stubPrototype.id,
  templateId: 'template-datum-01',
  typographyId: 'archivo-plexmono',
  buttonStyleId: 'button-milled',
  styleVariant: 'light',
  copyOverrides: {},
};

/** Matches the OFFER.md 2.1 display example: both numbers, leads larger. */
export const stubUsage: UsageSnapshot = {
  prototypeId: stubPrototype.id,
  periodStart: '2026-07-14T00:00:00Z',
  periodEnd: '2026-08-14T00:00:00Z',
  analysesUsed: 18,
  leadsCaptured: 31,
};

export const stubLeads: Lead[] = [
  {
    id: 'stub-lead-1',
    source: 'prototype',
    prototypeId: stubPrototype.id,
    quoteId: 'stub-quote-1',
    name: 'Homeowner A',
    phone: '+1214555xxxx',
    email: 'redacted@example.com',
    timeline: 'Within 2 weeks',
    wasDegraded: false,
    degradedReason: null,
    status: 'new',
    createdAt: '2026-07-29T14:03:00Z',
  },
  {
    id: 'stub-lead-2',
    source: 'prototype',
    prototypeId: stubPrototype.id,
    quoteId: null, // degraded lead: no quote row, BY DESIGN (DATA_MODEL.md 7)
    name: 'Homeowner B',
    phone: '+1214555xxxx',
    email: 'redacted@example.com',
    timeline: 'This month',
    wasDegraded: true,
    degradedReason: 'cap_reached',
    status: 'new',
    createdAt: '2026-07-30T09:41:00Z',
  },
  {
    id: 'stub-lead-3',
    source: 'demo',
    prototypeId: null,
    quoteId: 'stub-quote-3',
    name: 'Contractor via /demo',
    phone: '+1214555xxxx',
    email: 'redacted@example.com',
    timeline: 'Evaluating',
    wasDegraded: false,
    degradedReason: null,
    status: 'contacted',
    createdAt: '2026-07-28T18:20:00Z',
  },
];

/**
 * Epoxy quote_config.rules stub — SHAPED to pass epoxyPricingRuleSchema, with
 * realistic Dallas residential pricing ($5-8/sqft installed range). Phase 2's
 * seed.sql is the real seed; this exists only so placeholder pages render.
 */
export const stubEpoxyRules = {
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

// ---------------------------------------------------------------------------
// stub resolvers — Phase 6 replaces with real queries (lib/prototype.ts)
// ---------------------------------------------------------------------------

export interface ResolvedPrototype {
  prototype: Prototype;
  brandKit: BrandKit;
  templateConfig: TemplateConfig;
}

/**
 * STUB of resolvePrototypeBySlug(). Returns null for anything but the one
 * stub slug, and null for non-live status — so the /s/[slug] 404 semantics
 * required by the Phase 1 routing spec are real and testable today, and
 * Phase 6 swaps the internals without touching the route.
 */
export function stubResolvePrototypeBySlug(slug: string): ResolvedPrototype | null {
  if (slug !== STUB_LIVE_SLUG) return null;
  if (stubPrototype.status !== 'live') return null;
  return {
    prototype: stubPrototype,
    brandKit: stubBrandKit,
    templateConfig: stubTemplateConfig,
  };
}
