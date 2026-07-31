/**
 * Shared application types (Phase 1). Aligned with DATA_MODEL.md — the prose
 * doc is canonical; types/database.ts (Phase 2, hand-written) will mirror the
 * SQL exactly. These are the shapes application code passes around.
 */

// ---------------------------------------------------------------------------
// core unions (CONVENTIONS.md 1: string-literal unions over TS enums)
// ---------------------------------------------------------------------------

export type Tier = 'foundation' | 'operator';

export type PrototypeStatus = 'draft' | 'live' | 'expired' | 'revoked';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'grace'
  | 'suspended'
  | 'canceled';

export type ProspectStatus =
  | 'new'
  | 'qualified'
  | 'declined'
  | 'pitched'
  | 'customer'
  | 'churned';

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'dead';

export type LeadSource = 'public_hub' | 'demo' | 'prototype' | 'direct';

/**
 * The DB-persisted degraded reason on a lead (DATA_MODEL.md 7) — exactly three
 * values. `session_limit` is deliberately NOT here: hitting the per-session
 * analysis limit only removes further photo analyses; the deterministic quote
 * path still completes, so the lead is not degraded. lib/entitlements/types.ts
 * carries the wider runtime DecisionReason that includes 'session_limit'.
 */
export type DbDegradedReason =
  | 'cap_reached'
  | 'subscription_suspended'
  | 'ai_unavailable';

export type ExtractionSource = 'client_canvas' | 'server' | 'manual';

/** The four analytics surfaces (EVENTS.md envelope). */
export type Surface = 'public_hub' | 'demo' | 'prototype' | 'admin';

/**
 * Widget mode — ALWAYS an explicit prop, never inferred from route
 * (CONVENTIONS.md 4, SPEC R-123). Inferring mode is how a prototype session
 * eventually consumes a contractor's quota.
 */
export type WidgetMode = 'live' | 'prototype' | 'preview';

export type StyleVariant = 'light' | 'dark-industrial';

// ---------------------------------------------------------------------------
// entity shapes consumed by Phase 1 stubs and placeholders
// ---------------------------------------------------------------------------

export interface Plan {
  code: Tier;
  name: string;
  setupFeeCents: number;
  monthlyCents: number;
  /** null = unlimited (DATA_MODEL.md 12 — deliberately not a sentinel int). */
  analysisLimitPerMonth: number | null;
  analysisLimitPerSession: number;
  features: Record<string, boolean>;
  isActive: boolean;
}

export interface Prospect {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  websiteUrl: string;
  vertical: string;
  status: ProspectStatus;
  qualificationScore: number | null;
}

export interface Prototype {
  id: string;
  prospectId: string;
  slug: string;
  status: PrototypeStatus;
  expiresAt: string | null;
  tier: Tier | null;
  /** Denormalised mirror; check.ts resolves the authoritative answer. */
  subscriptionStatus: SubscriptionStatus | null;
  vertical: string;
}

export interface BrandKit {
  prototypeId: string;
  logoPath: string | null;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  extractionSource: ExtractionSource;
}

export interface TemplateConfig {
  prototypeId: string;
  templateId: string;
  typographyId: string;
  buttonStyleId: string;
  styleVariant: StyleVariant;
  copyOverrides: Record<string, string>;
}

export interface Lead {
  id: string;
  source: LeadSource;
  prototypeId: string | null;
  /** Nullable BY DESIGN: a degraded lead has no quote row (DATA_MODEL.md 7). */
  quoteId: string | null;
  name: string;
  phone: string;
  email: string;
  timeline: string;
  wasDegraded: boolean;
  degradedReason: DbDegradedReason | null;
  status: LeadStatus;
  createdAt: string;
}

export interface UsageSnapshot {
  prototypeId: string;
  periodStart: string;
  periodEnd: string;
  analysesUsed: number;
  /** Never capped — always shown beside analysesUsed (OFFER.md 2.1). */
  leadsCaptured: number;
}
