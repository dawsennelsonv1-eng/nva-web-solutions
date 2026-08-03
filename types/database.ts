/**
 * types/database.ts — HAND-WRITTEN, exactly matching supabase/migrations
 * 0001–0005 as verified by execution. If the SQL and this file
 * disagree, the SQL that actually ran wins and this file is the defect.
 *
 * WHY EVERY SHAPE HERE IS A `type` AND NOT AN `interface`:
 * @supabase/postgrest-js constrains a schema to `Record<string, GenericTable>`,
 * and TypeScript only grants an implicit index signature to object *type
 * aliases* — never to interfaces. Declaring these as interfaces makes the
 * whole schema fail the constraint, at which point every .from() and .rpc()
 * call silently resolves to `never` instead of erroring at the definition.
 * This is not a style preference; it is load-bearing.
 *
 * Conventions: timestamptz → string (ISO 8601) · jsonb → Json ·
 * numeric → number · pg enums → the string-literal unions below (which also
 * mirror types/index.ts application unions 1:1).
 *
 * EVERY ROW SHAPE IS A `type` ALIAS, NEVER AN `interface`. This is not style.
 * TypeScript grants implicit index signatures to type aliases but NOT to
 * interfaces, so an interface cannot satisfy postgrest-js's
 * `Row: Record<string, unknown>` constraint. When that constraint fails, the
 * whole schema falls back to `never` and every .from()/.rpc() call silently
 * loses its types — with errors that point at your query, not at this file.
 * Corrected in Phase 3 after the first real queries exposed it.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ---------------------------------------------------------------------------
// enums (0001_init.sql / 0002_billing.sql)
// ---------------------------------------------------------------------------

export type DbProspectStatus =
  | 'new' | 'qualified' | 'declined' | 'pitched' | 'customer' | 'churned';
export type DbPrototypeStatus = 'draft' | 'live' | 'expired' | 'revoked';
export type DbExtractionSource = 'client_canvas' | 'server' | 'manual';
export type DbStyleVariant = 'light' | 'dark-industrial';
export type DbLeadSource = 'public_hub' | 'demo' | 'prototype' | 'direct';
export type DbLeadStatus = 'new' | 'contacted' | 'qualified' | 'dead';
export type DbDegradedReason =
  | 'cap_reached' | 'subscription_suspended' | 'ai_unavailable';
export type DbSessionSurface = 'public_hub' | 'demo' | 'prototype' | 'admin';
export type DbAiJobStatus = 'succeeded' | 'failed' | 'invalid_output';
export type DbPaymentProvider = 'stripe' | 'manual' | 'stub';
export type DbSubscriptionStatus =
  | 'trialing' | 'active' | 'past_due' | 'grace' | 'suspended' | 'canceled';
export type DbPaymentKind = 'setup' | 'recurring' | 'refund';
export type DbPaymentStatus = 'succeeded' | 'failed' | 'refunded';
export type DbDunningChannel = 'email' | 'sms';

// ---------------------------------------------------------------------------
// row shapes
// ---------------------------------------------------------------------------

export type ProspectRow = {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  website_url: string | null;
  vertical: string;
  has_google_ads: boolean | null;
  google_review_count: number | null;
  estimated_monthly_traffic: number | null;
  qualification_score: number | null;
  qualification_notes: string | null;
  /** 0007_admin.sql (Phase 6) additions — the three scorecard signals
   * OFFER.md §7 marked "derived" but never gave columns to. */
  google_search_rank: 'page_1' | 'page_2' | 'not_ranking' | 'unknown';
  has_quote_or_pricing_tool: boolean | null;
  site_looks_abandoned: boolean | null;
  status: DbProspectStatus;
  created_at: string;
  updated_at: string;
};
export type ProspectInsert = Partial<ProspectRow> & { business_name: string };
export type ProspectUpdate = Partial<ProspectRow>;

export type PrototypeRow = {
  id: string;
  prospect_id: string;
  slug: string;
  status: DbPrototypeStatus;
  expires_at: string | null;
  tier: string | null;
  subscription_status: string | null; // webhook-written mirror; never authoritative
  vertical: string;
  created_at: string;
  updated_at: string;
};
export type PrototypeInsert = Partial<PrototypeRow> & {
  prospect_id: string;
  slug: string;
};
export type PrototypeUpdate = Partial<PrototypeRow>;

export type BrandKitRow = {
  id: string;
  prototype_id: string;
  logo_path: string | null;
  primary_hex: string | null;
  secondary_hex: string | null;
  accent_hex: string | null;
  derived_tokens: Json | null;
  pinned_tokens: Json | null;
  extraction_source: DbExtractionSource;
  created_at: string;
  updated_at: string;
};
export type BrandKitInsert = Partial<BrandKitRow> & { prototype_id: string };
export type BrandKitUpdate = Partial<BrandKitRow>;

export type TemplateConfigRow = {
  id: string;
  prototype_id: string;
  template_id: string;
  typography_id: string;
  button_style_id: string;
  style_variant: DbStyleVariant;
  copy_overrides: Json;
  created_at: string;
  updated_at: string;
};
export type TemplateConfigInsert = Partial<TemplateConfigRow> & {
  prototype_id: string;
  template_id: string;
  typography_id: string;
  button_style_id: string;
};
export type TemplateConfigUpdate = Partial<TemplateConfigRow>;

export type QuoteConfigRow = {
  id: string;
  prototype_id: string;
  vertical: string;
  rules: Json;
  finish_catalogue: Json;
  sqft_min: number;
  sqft_max: number;
  range_spread_pct: number;
  created_at: string;
  updated_at: string;
};
export type QuoteConfigInsert = Partial<QuoteConfigRow> & {
  prototype_id: string;
  vertical: string;
  rules: Json;
  finish_catalogue: Json;
  sqft_min: number;
  sqft_max: number;
  range_spread_pct: number;
};
export type QuoteConfigUpdate = Partial<QuoteConfigRow>;

export type QuoteRow = {
  id: string;
  public_id: string;
  prototype_id: string | null;
  vertical: string;
  inputs: Json;
  low_cents: number;
  high_cents: number;
  breakdown: Json;
  photo_path: string | null;
  used_ai_analysis: boolean;
  was_capped: boolean;
  session_id: string | null;
  created_at: string;
};
export type QuoteInsert = Partial<QuoteRow> & {
  public_id: string;
  vertical: string;
  inputs: Json;
  low_cents: number;
  high_cents: number;
  breakdown: Json;
};
export type QuoteUpdate = Partial<QuoteRow>;

export type LeadRow = {
  id: string;
  source: DbLeadSource;
  prototype_id: string | null;
  quote_id: string | null; // nullable BY DESIGN — degraded leads have no quote
  name: string;
  phone: string;
  email: string;
  timeline: string | null;
  was_degraded: boolean;
  degraded_reason: DbDegradedReason | null;
  routed_at: string | null;
  delivery_status: Json;
  status: DbLeadStatus;
  notes: string | null;
  created_at: string;
};
export type LeadInsert = Partial<LeadRow> & {
  source: DbLeadSource;
  name: string;
  phone: string;
  email: string;
};
export type LeadUpdate = Partial<LeadRow>;

export type DemoSessionRow = {
  id: string;
  session_id: string;
  prototype_id: string | null;
  surface: DbSessionSurface;
  step_progression: Json;
  abandoned_at: string | null;
  abandoned_step: string | null;
  analyses_used_this_session: number;
  created_at: string;
  updated_at: string;
};
export type DemoSessionInsert = Partial<DemoSessionRow> & {
  session_id: string;
  surface: DbSessionSurface;
};
export type DemoSessionUpdate = Partial<DemoSessionRow>;

export type AnalyticsEventRow = {
  id: string;
  event_name: string;
  session_id: string | null;
  prototype_id: string | null;
  properties: Json;
  occurred_at: string;
};
export type AnalyticsEventInsert = Partial<AnalyticsEventRow> & {
  event_name: string;
};
export type AnalyticsEventUpdate = Partial<AnalyticsEventRow>;

export type AiJobRow = {
  id: string;
  prototype_id: string | null;
  job_type: string;
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_cents: number | null;
  status: DbAiJobStatus;
  error: string | null;
  created_at: string;
};
export type AiJobInsert = Partial<AiJobRow> & {
  provider: string;
  model: string;
  status: DbAiJobStatus;
};
export type AiJobUpdate = Partial<AiJobRow>;

export type StylePresetRow = {
  id: string;
  name: string;
  template_id: string;
  typography_id: string;
  button_style_id: string;
  style_variant: DbStyleVariant;
  palette: Json;
  is_system: boolean;
  created_at: string;
};
export type StylePresetInsert = Partial<StylePresetRow> & {
  name: string;
  template_id: string;
  typography_id: string;
  button_style_id: string;
};
export type StylePresetUpdate = Partial<StylePresetRow>;

export type PlanRow = {
  code: string;
  name: string;
  setup_fee_cents: number;
  monthly_cents: number;
  analysis_limit_per_month: number | null; // null = unlimited, by contract
  analysis_limit_per_session: number;
  features: Json;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
export type PlanInsert = Partial<PlanRow> & {
  code: string;
  name: string;
  setup_fee_cents: number;
  monthly_cents: number;
};
export type PlanUpdate = Partial<PlanRow>;

export type SubscriptionRow = {
  id: string;
  prospect_id: string;
  prototype_id: string;
  plan_code: string;
  provider: DbPaymentProvider;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  status: DbSubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  grace_ends_at: string | null;
  canceled_at: string | null;
  /** 0006_billing_ops.sql — out-of-order webhook guard. Webhook path only. */
  last_provider_event_at: string | null;
  created_at: string;
  updated_at: string;
};
export type SubscriptionInsert = Partial<SubscriptionRow> & {
  prospect_id: string;
  prototype_id: string;
  plan_code: string;
  provider: DbPaymentProvider;
  status: DbSubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
};
export type SubscriptionUpdate = Partial<SubscriptionRow>;

export type PaymentRow = {
  id: string;
  subscription_id: string;
  provider_payment_id: string | null;
  kind: DbPaymentKind;
  amount_cents: number; // negative for refunds
  currency: string;
  status: DbPaymentStatus;
  failure_reason: string | null;
  occurred_at: string;
  created_at: string;
};
export type PaymentInsert = Partial<PaymentRow> & {
  subscription_id: string;
  kind: DbPaymentKind;
  amount_cents: number;
  status: DbPaymentStatus;
  occurred_at: string;
};
export type PaymentUpdate = Partial<PaymentRow>;

export type UsageCounterRow = {
  id: string;
  prototype_id: string;
  period_start: string;
  period_end: string;
  analyses_used: number;
  leads_captured: number; // never capped
  cap_reached_at: string | null;
  warned_at_20: string | null;
  created_at: string;
  updated_at: string;
};
export type UsageCounterInsert = Partial<UsageCounterRow> & {
  prototype_id: string;
  period_start: string;
  period_end: string;
};
export type UsageCounterUpdate = Partial<UsageCounterRow>;

export type DunningEventRow = {
  id: string;
  subscription_id: string;
  day_number: 1 | 3 | 5 | 7 | 10;
  channel: DbDunningChannel;
  sent_at: string;
  delivery_status: string | null;
};
export type DunningEventInsert = Partial<DunningEventRow> & {
  subscription_id: string;
  day_number: 1 | 3 | 5 | 7 | 10;
  channel: DbDunningChannel;
};
export type DunningEventUpdate = Partial<DunningEventRow>;

export type WebhookEventRow = {
  id: string;
  provider: string;
  provider_event_id: string; // UNIQUE — the idempotency guard
  payload: Json;
  received_at: string;
  processed_at: string | null;
  processing_error: string | null;
};
export type WebhookEventInsert = Partial<WebhookEventRow> & {
  provider: string;
  provider_event_id: string;
  payload: Json;
};
export type WebhookEventUpdate = Partial<WebhookEventRow>;

export type AppAdminRow = {
  email: string;
  note: string | null;
  created_at: string;
};
export type AppAdminInsert = Partial<AppAdminRow> & { email: string };
export type AppAdminUpdate = Partial<AppAdminRow>;


export type RateLimitHitRow = {
  bucket_key: string;
  scope: string;
  window_start: string;
  hits: number;
};
export type RateLimitHitInsert = Partial<RateLimitHitRow> & {
  bucket_key: string;
  scope: string;
  window_start: string;
};
export type RateLimitHitUpdate = Partial<RateLimitHitRow>;


export type PrototypePreviewRow = {
  id: string;
  prototype_id: string;
  staged_brand: Json;
  staged_template: Json;
  created_at: string;
  updated_at: string;
  expires_at: string;
};
export type PrototypePreviewInsert = Partial<PrototypePreviewRow> & {
  prototype_id: string;
  staged_brand: Json;
  staged_template: Json;
};
export type PrototypePreviewUpdate = Partial<PrototypePreviewRow>;

// ---------------------------------------------------------------------------
// the Database interface consumed by createClient<Database>()
// ---------------------------------------------------------------------------

export type Database = {
  public: {
    // Relationships is REQUIRED by @supabase/postgrest-js: a table entry
    // missing it fails the GenericSchema constraint and the ENTIRE schema
    // silently resolves to `never`, so every .from()/.rpc() call loses its
    // types without an obvious error. Empty arrays are correct here — we
    // never use PostgREST embedded-resource syntax (`select('*, other(*)')`),
    // because every tenant-scoped read goes through the explicit helper in
    // lib/supabase/server.ts. If a future phase adds an embedded select, that
    // table's relationship must be declared here first.
    Tables: {
      prospects: { Row: ProspectRow; Insert: ProspectInsert; Update: ProspectUpdate; Relationships: [] };
      prototypes: { Row: PrototypeRow; Insert: PrototypeInsert; Update: PrototypeUpdate; Relationships: [] };
      brand_kits: { Row: BrandKitRow; Insert: BrandKitInsert; Update: BrandKitUpdate; Relationships: [] };
      template_configs: { Row: TemplateConfigRow; Insert: TemplateConfigInsert; Update: TemplateConfigUpdate; Relationships: [] };
      quote_configs: { Row: QuoteConfigRow; Insert: QuoteConfigInsert; Update: QuoteConfigUpdate; Relationships: [] };
      quotes: { Row: QuoteRow; Insert: QuoteInsert; Update: QuoteUpdate; Relationships: [] };
      leads: { Row: LeadRow; Insert: LeadInsert; Update: LeadUpdate; Relationships: [] };
      demo_sessions: { Row: DemoSessionRow; Insert: DemoSessionInsert; Update: DemoSessionUpdate; Relationships: [] };
      analytics_events: { Row: AnalyticsEventRow; Insert: AnalyticsEventInsert; Update: AnalyticsEventUpdate; Relationships: [] };
      ai_jobs: { Row: AiJobRow; Insert: AiJobInsert; Update: AiJobUpdate; Relationships: [] };
      style_presets: { Row: StylePresetRow; Insert: StylePresetInsert; Update: StylePresetUpdate; Relationships: [] };
      plans: { Row: PlanRow; Insert: PlanInsert; Update: PlanUpdate; Relationships: [] };
      subscriptions: { Row: SubscriptionRow; Insert: SubscriptionInsert; Update: SubscriptionUpdate; Relationships: [] };
      payments: { Row: PaymentRow; Insert: PaymentInsert; Update: PaymentUpdate; Relationships: [] };
      usage_counters: { Row: UsageCounterRow; Insert: UsageCounterInsert; Update: UsageCounterUpdate; Relationships: [] };
      dunning_events: { Row: DunningEventRow; Insert: DunningEventInsert; Update: DunningEventUpdate; Relationships: [] };
      webhook_events: { Row: WebhookEventRow; Insert: WebhookEventInsert; Update: WebhookEventUpdate; Relationships: [] };
      app_admins: { Row: AppAdminRow; Insert: AppAdminInsert; Update: AppAdminUpdate; Relationships: [] };
      rate_limit_hits: { Row: RateLimitHitRow; Insert: RateLimitHitInsert; Update: RateLimitHitUpdate; Relationships: [] };
      prototype_previews: { Row: PrototypePreviewRow; Insert: PrototypePreviewInsert; Update: PrototypePreviewUpdate; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      prototype_is_live: { Args: { p_prototype_id: string }; Returns: boolean };
      resolve_prototype_by_slug: { Args: { p_slug: string }; Returns: Json };
      get_quote_by_public_id: { Args: { p_public_id: string }; Returns: Json };
      touch_demo_session: {
        Args: {
          p_session_id: string;
          p_surface: DbSessionSurface;
          p_prototype_id?: string | null;
          p_step?: string | null;
          p_abandoned?: boolean;
        };
        Returns: undefined;
      };
      increment_session_analyses: {
        Args: { p_session_id: string; p_limit: number };
        Returns: number;
      };
      increment_usage: {
        Args: {
          p_prototype_id: string;
          p_period_start: string;
          p_period_end: string;
          p_kind: 'analysis' | 'lead';
          p_limit?: number | null;
        };
        Returns: UsageCounterRow;
      };
      get_usage: {
        Args: { p_prototype_id: string; p_period_start: string };
        Returns: UsageCounterRow;
      };
      // --- 0005_rate_limits.sql (Phase 3) ---
      check_rate_limit: {
        Args: {
          p_bucket_key: string;
          p_scope: string;
          p_window_seconds: number;
          p_max: number;
        };
        /** { allowed, hits, max, window_start, retry_after_seconds } */
        Returns: Json;
      };
      prune_rate_limit_hits: {
        Args: { p_older_than?: string };
        Returns: number;
      };
      // --- 0006_billing_ops.sql (Phase 5.5) ---
      resolve_prototype_full: {
        Args: { p_slug: string };
        Returns: Json;
      };
      resolve_prototype_full_by_id: {
        Args: { p_prototype_id: string };
        Returns: Json;
      };
      ai_spend_today_cents: {
        Args: Record<string, never>;
        Returns: number;
      };
      claim_spend_alert: {
        Args: { p_scope: string; p_threshold_pct: number; p_spent_cents: number; p_ceiling_cents: number };
        Returns: boolean;
      };
      billing_overview: {
        Args: Record<string, never>;
        Returns: {
          prototype_id: string;
          slug: string;
          business_name: string;
          contact_name: string | null;
          phone: string | null;
          email: string | null;
          plan_code: string;
          subscription_id: string;
          status: DbSubscriptionStatus;
          provider: DbPaymentProvider;
          current_period_start: string;
          current_period_end: string;
          analyses_used: number;
          leads_captured: number;
          analysis_limit: number | null;
          cap_reached_at: string | null;
          pct_of_cap: number | null;
        }[];
      };
    };
    Enums: {
      prospect_status: DbProspectStatus;
      prototype_status: DbPrototypeStatus;
      extraction_source: DbExtractionSource;
      style_variant: DbStyleVariant;
      lead_source: DbLeadSource;
      lead_status: DbLeadStatus;
      degraded_reason: DbDegradedReason;
      session_surface: DbSessionSurface;
      ai_job_status: DbAiJobStatus;
      payment_provider: DbPaymentProvider;
      subscription_status: DbSubscriptionStatus;
      payment_kind: DbPaymentKind;
      payment_status: DbPaymentStatus;
      dunning_channel: DbDunningChannel;
    };
    CompositeTypes: Record<string, never>;
  };
};
