/**
 * types/database.ts — HAND-WRITTEN, exactly matching supabase/migrations
 * 0001–0004 as verified by execution in Phase 2. If the SQL and this file
 * disagree, the SQL that actually ran wins and this file is the defect.
 *
 * Conventions: timestamptz → string (ISO 8601) · jsonb → Json ·
 * numeric → number · pg enums → the string-literal unions below (which also
 * mirror types/index.ts application unions 1:1).
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

export interface ProspectRow {
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
  status: DbProspectStatus;
  created_at: string;
  updated_at: string;
}
export type ProspectInsert = Partial<ProspectRow> & { business_name: string };
export type ProspectUpdate = Partial<ProspectRow>;

export interface PrototypeRow {
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
}
export type PrototypeInsert = Partial<PrototypeRow> & {
  prospect_id: string;
  slug: string;
};
export type PrototypeUpdate = Partial<PrototypeRow>;

export interface BrandKitRow {
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
}
export type BrandKitInsert = Partial<BrandKitRow> & { prototype_id: string };
export type BrandKitUpdate = Partial<BrandKitRow>;

export interface TemplateConfigRow {
  id: string;
  prototype_id: string;
  template_id: string;
  typography_id: string;
  button_style_id: string;
  style_variant: DbStyleVariant;
  copy_overrides: Json;
  created_at: string;
  updated_at: string;
}
export type TemplateConfigInsert = Partial<TemplateConfigRow> & {
  prototype_id: string;
  template_id: string;
  typography_id: string;
  button_style_id: string;
};
export type TemplateConfigUpdate = Partial<TemplateConfigRow>;

export interface QuoteConfigRow {
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
}
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

export interface QuoteRow {
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
}
export type QuoteInsert = Partial<QuoteRow> & {
  public_id: string;
  vertical: string;
  inputs: Json;
  low_cents: number;
  high_cents: number;
  breakdown: Json;
};
export type QuoteUpdate = Partial<QuoteRow>;

export interface LeadRow {
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
}
export type LeadInsert = Partial<LeadRow> & {
  source: DbLeadSource;
  name: string;
  phone: string;
  email: string;
};
export type LeadUpdate = Partial<LeadRow>;

export interface DemoSessionRow {
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
}
export type DemoSessionInsert = Partial<DemoSessionRow> & {
  session_id: string;
  surface: DbSessionSurface;
};
export type DemoSessionUpdate = Partial<DemoSessionRow>;

export interface AnalyticsEventRow {
  id: string;
  event_name: string;
  session_id: string | null;
  prototype_id: string | null;
  properties: Json;
  occurred_at: string;
}
export type AnalyticsEventInsert = Partial<AnalyticsEventRow> & {
  event_name: string;
};
export type AnalyticsEventUpdate = Partial<AnalyticsEventRow>;

export interface AiJobRow {
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
}
export type AiJobInsert = Partial<AiJobRow> & {
  provider: string;
  model: string;
  status: DbAiJobStatus;
};
export type AiJobUpdate = Partial<AiJobRow>;

export interface StylePresetRow {
  id: string;
  name: string;
  template_id: string;
  typography_id: string;
  button_style_id: string;
  style_variant: DbStyleVariant;
  palette: Json;
  is_system: boolean;
  created_at: string;
}
export type StylePresetInsert = Partial<StylePresetRow> & {
  name: string;
  template_id: string;
  typography_id: string;
  button_style_id: string;
};
export type StylePresetUpdate = Partial<StylePresetRow>;

export interface PlanRow {
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
}
export type PlanInsert = Partial<PlanRow> & {
  code: string;
  name: string;
  setup_fee_cents: number;
  monthly_cents: number;
};
export type PlanUpdate = Partial<PlanRow>;

export interface SubscriptionRow {
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
  created_at: string;
  updated_at: string;
}
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

export interface PaymentRow {
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
}
export type PaymentInsert = Partial<PaymentRow> & {
  subscription_id: string;
  kind: DbPaymentKind;
  amount_cents: number;
  status: DbPaymentStatus;
  occurred_at: string;
};
export type PaymentUpdate = Partial<PaymentRow>;

export interface UsageCounterRow {
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
}
export type UsageCounterInsert = Partial<UsageCounterRow> & {
  prototype_id: string;
  period_start: string;
  period_end: string;
};
export type UsageCounterUpdate = Partial<UsageCounterRow>;

export interface DunningEventRow {
  id: string;
  subscription_id: string;
  day_number: 1 | 3 | 5 | 7 | 10;
  channel: DbDunningChannel;
  sent_at: string;
  delivery_status: string | null;
}
export type DunningEventInsert = Partial<DunningEventRow> & {
  subscription_id: string;
  day_number: 1 | 3 | 5 | 7 | 10;
  channel: DbDunningChannel;
};
export type DunningEventUpdate = Partial<DunningEventRow>;

export interface WebhookEventRow {
  id: string;
  provider: string;
  provider_event_id: string; // UNIQUE — the idempotency guard
  payload: Json;
  received_at: string;
  processed_at: string | null;
  processing_error: string | null;
}
export type WebhookEventInsert = Partial<WebhookEventRow> & {
  provider: string;
  provider_event_id: string;
  payload: Json;
};
export type WebhookEventUpdate = Partial<WebhookEventRow>;

export interface AppAdminRow {
  email: string;
  note: string | null;
  created_at: string;
}
export type AppAdminInsert = Partial<AppAdminRow> & { email: string };
export type AppAdminUpdate = Partial<AppAdminRow>;

// ---------------------------------------------------------------------------
// the Database interface consumed by createClient<Database>()
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      prospects: { Row: ProspectRow; Insert: ProspectInsert; Update: ProspectUpdate };
      prototypes: { Row: PrototypeRow; Insert: PrototypeInsert; Update: PrototypeUpdate };
      brand_kits: { Row: BrandKitRow; Insert: BrandKitInsert; Update: BrandKitUpdate };
      template_configs: { Row: TemplateConfigRow; Insert: TemplateConfigInsert; Update: TemplateConfigUpdate };
      quote_configs: { Row: QuoteConfigRow; Insert: QuoteConfigInsert; Update: QuoteConfigUpdate };
      quotes: { Row: QuoteRow; Insert: QuoteInsert; Update: QuoteUpdate };
      leads: { Row: LeadRow; Insert: LeadInsert; Update: LeadUpdate };
      demo_sessions: { Row: DemoSessionRow; Insert: DemoSessionInsert; Update: DemoSessionUpdate };
      analytics_events: { Row: AnalyticsEventRow; Insert: AnalyticsEventInsert; Update: AnalyticsEventUpdate };
      ai_jobs: { Row: AiJobRow; Insert: AiJobInsert; Update: AiJobUpdate };
      style_presets: { Row: StylePresetRow; Insert: StylePresetInsert; Update: StylePresetUpdate };
      plans: { Row: PlanRow; Insert: PlanInsert; Update: PlanUpdate };
      subscriptions: { Row: SubscriptionRow; Insert: SubscriptionInsert; Update: SubscriptionUpdate };
      payments: { Row: PaymentRow; Insert: PaymentInsert; Update: PaymentUpdate };
      usage_counters: { Row: UsageCounterRow; Insert: UsageCounterInsert; Update: UsageCounterUpdate };
      dunning_events: { Row: DunningEventRow; Insert: DunningEventInsert; Update: DunningEventUpdate };
      webhook_events: { Row: WebhookEventRow; Insert: WebhookEventInsert; Update: WebhookEventUpdate };
      app_admins: { Row: AppAdminRow; Insert: AppAdminInsert; Update: AppAdminUpdate };
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
}
