/**
 * types/database.ts — HAND-WRITTEN. If the SQL and this file disagree, the SQL
 * that actually ran wins and this file is the defect.
 *
 * ===========================================================================
 * COVERAGE — READ THIS BEFORE TRUSTING IT
 * ===========================================================================
 *
 * Verified by execution against migrations 0001–0005, PLUS 0017, 0018 and 0019
 * which were written in Phase 16 and are transcribed here from their own SQL.
 *
 * MIGRATIONS 0006–0016 ARE STILL MISSING FROM THIS FILE. Tables added by them
 * — concierge_requests, companies, company_members, build_log and whatever else
 * those migrations created — do not appear below, so a .from() call naming one
 * of them will not typecheck and needs a cast at the call site.
 *
 * That gap is deliberate rather than forgotten: adding a table here without the
 * migration open beside it is how a hand-written type file starts disagreeing
 * with the schema in ways nothing catches, which is worse than an honest hole.
 * Fill them in one at a time, with the SQL in front of you.
 *
 * WHEN YOU ADD ONE, GREP FOR ITS CASTS. Three files carried structural casts
 * because of this gap and all three were cleaned up when 0017–0019 landed here:
 * app/actions/implementation.ts, lib/site/theme.ts, lib/tools/media.ts.
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

  /* ------------------------------------------------------------------------
     ADDED AFTER 0005. This file's header says it matches migrations 0001-0005
     and that when the SQL and this file disagree, the SQL wins and this file
     is the defect. These three columns are that defect being paid off:

       assigned_to   0014_companies.sql   which member owns this lead
       trade         0015_lead_trade.sql  what work a contractor lead wants
       render_path   0016_lead_render.sql the finish render he was shown

     They are added here rather than worked around at the call site because
     the workaround has now been needed three separate times, and each one
     spends a build to discover. A missing column does not fail loudly — it
     resolves the property to `never`, which reads as an unrelated type error
     several lines from the real cause.

     THIS IS STILL A PATCH, NOT A FIX. The file remains hand-written and the
     next migration will desynchronise it again. The actual fix is one command:
       npx supabase gen types typescript --project-id <ref> > types/database.ts
     which also deletes lib/queue/db.ts, lib/companies/db.ts's cast and
     widenedAdmin() in lib/site/metrics.ts.
     --------------------------------------------------------------------- */
  assigned_to: string | null;
  trade: string | null;
  render_path: string | null;
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

/**
 * ============================================================================
 * COMPLETED IN PHASE 50. THIS TYPE WAS STALE, NOT MERELY INCOMPLETE.
 * ============================================================================
 *
 * It declared eleven columns. `lib/ai/jobs.ts` writes NINETEEN, and migration
 * 0010_ai_suite.sql adds fifteen more to the table on top of the original
 * create. The eight missing here are the ones every ledger row has carried
 * since 0010: the cache token counts, the estimate flag, the prompt version,
 * the attempt count, the duration, the request and output payloads, and the
 * fallback chain.
 *
 * A STALE TYPE IS WORSE THAN AN ABSENT ONE. An absent table forces a cast,
 * which is at least visibly a cast. This one looked complete, so anything
 * reading `ai_jobs` through it saw a table that had not existed since
 * migration 0010 — and `lib/ai/jobs.ts` worked around that with its own
 * `as unknown as AiDb`, which then erased checking for the whole file
 * including the columns that WERE correct here.
 *
 * Regenerated from 0010_ai_suite.sql: every `alter table ai_jobs add column`
 * in that file, with nullability read from the statement rather than assumed.
 * `fell_back_from` is `text[]`, which is why it is `string[]`.
 *
 * `applied_at`, `applied_by`, `apply_note` and `discarded_at` are included
 * even though nothing in the code writes them yet. They exist in the table, so
 * they belong in the type — a column that exists and is not declared is
 * precisely the gap this phase is closing, and omitting them because they are
 * currently unused rebuilds it.
 */
export type AiJobRow = {
  id: string;
  prototype_id: string | null;
  job_type: string;
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number;
  cache_write_tokens: number;
  cost_cents: number | null;
  cost_estimated: boolean;
  status: DbAiJobStatus;
  error: string | null;
  prompt_version: string | null;
  attempts: number;
  duration_ms: number | null;
  created_by: string | null;
  request: Json | null;
  output: Json | null;
  fell_back_from: string[] | null;
  applied_at: string | null;
  applied_by: string | null;
  apply_note: string | null;
  discarded_at: string | null;
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
// ---------------------------------------------------------------------------
// PHASE 16 TABLES — 0017_implementation_requests, 0018_site_settings,
// 0019_tool_media. Transcribed from those migrations.
//
// Every column that is nullable in the SQL is `| null` here, and every column
// with a DEFAULT is optional on Insert. Getting that pairing wrong is the
// failure mode of a hand-written type file: it compiles, and then a NOT NULL
// violation appears at runtime in production instead of at the keyboard.
// ---------------------------------------------------------------------------

export type DbImplementationRequestKind = 'tool_install' | 'custom_build';
export type DbImplementationRequestStatus = 'new' | 'contacted' | 'closed';

export type ImplementationRequestRow = {
  id: string;
  created_at: string;
  kind: DbImplementationRequestKind;
  tool_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  business_name: string | null;
  business_field: string | null;
  website_url: string | null;
  customer_type: string | null;
  description: string;
  source: string | null;
  status: DbImplementationRequestStatus;
  delivery_status: Json;
};
// id, created_at, status and delivery_status all have DEFAULTs, so only the
// four genuinely required columns are demanded here.
export type ImplementationRequestInsert = Partial<ImplementationRequestRow> & {
  kind: DbImplementationRequestKind;
  name: string;
  email: string;
  description: string;
};
export type ImplementationRequestUpdate = Partial<ImplementationRequestRow>;

export type SiteSettingRow = {
  key: string;
  value: string;
  updated_at: string;
};
export type SiteSettingInsert = Partial<SiteSettingRow> & { key: string; value: string };
export type SiteSettingUpdate = Partial<SiteSettingRow>;

export type DbToolMediaKind = 'animation' | 'still';

export type ToolMediaRow = {
  tool_id: string;
  position: number;
  kind: DbToolMediaKind;
  src: string;
  alt: string;
  caption: string;
  duration_ms: number;
  updated_at: string;
};
// duration_ms and updated_at have DEFAULTs; the composite primary key
// (tool_id, position) does not, so both are required.
export type ToolMediaInsert = Partial<ToolMediaRow> & {
  tool_id: string;
  position: number;
  kind: DbToolMediaKind;
  src: string;
  alt: string;
  caption: string;
};
export type ToolMediaUpdate = Partial<ToolMediaRow>;

// the Database interface consumed by createClient<Database>()
// ---------------------------------------------------------------------------

/* ==========================================================================
 * PHASE 47 — THE NINE TABLES THAT EXISTED IN THE SCHEMA AND NOT IN THESE TYPES
 * ==========================================================================
 *
 * Every one of these was reachable only through a structural cast, because
 * `Database` did not know the table existed. That cast is why a misspelled
 * column against any of them compiled cleanly and failed at runtime, and it is
 * the friction behind the standing rule that post-0005 tables need hand-written
 * shapes at every call site.
 *
 * DERIVED FROM THE MIGRATIONS, NOT WRITTEN FROM MEMORY. Each block was
 * generated by parsing the `create table` statement it comes from, so column
 * names, SQL types and nullability match the schema by construction rather
 * than by care.
 *
 * NULLABILITY: a column is `| null` exactly when the SQL omits NOT NULL.
 *
 * INSERT: every field optional EXCEPT NOT NULL columns with no DEFAULT — the
 * ones Postgres genuinely rejects without. A NOT NULL column that IS defaulted
 * stays optional, which is what makes created_at omittable and matches
 * AiJobInsert above.
 *
 * NOT NARROWED TO UNIONS. Several carry a CHECK constraint — finish_media.kind
 * is 'swatch' or 'combination', company_members.role is a small set — and they
 * are typed `string` here on purpose. Narrowing means a hand-maintained union
 * kept in step with the constraint, which is exactly the duplication that goes
 * stale silently. The looseness is safe: the database still rejects a bad
 * value.
 * ========================================================================== */

export type AiSpendAlertRow = {
  id: number | null;
  scope: string;
  utc_day: string;
  threshold_pct: number;
  spent_cents: number;
  ceiling_cents: number;
  created_at: string;
};
export type AiSpendAlertInsert = Partial<AiSpendAlertRow> & {
  scope: string;
  utc_day: string;
  threshold_pct: number;
  spent_cents: number;
  ceiling_cents: number;
};
export type AiSpendAlertUpdate = Partial<AiSpendAlertRow>;

export type BuildLogEntryRow = {
  id: string | null;
  occurred_on: string;
  tool_id: string | null;
  entry: string;
  created_at: string;
};
export type BuildLogEntryInsert = Partial<BuildLogEntryRow> & {
  occurred_on: string;
  entry: string;
};
export type BuildLogEntryUpdate = Partial<BuildLogEntryRow>;

export type BuildMonthRow = {
  id: string | null;
  month: string;
  tool_id: string;
  won_by_vote: boolean;
  entered_build_on: string | null;
  shipped_on: string | null;
  created_at: string;
};
export type BuildMonthInsert = Partial<BuildMonthRow> & {
  month: string;
  tool_id: string;
};
export type BuildMonthUpdate = Partial<BuildMonthRow>;

export type CompanyRow = {
  id: string | null;
  name: string;
  seat_limit: number;
  created_at: string;
  updated_at: string;
};
export type CompanyInsert = Partial<CompanyRow> & {
  name: string;
};
export type CompanyUpdate = Partial<CompanyRow>;

export type CompanyMemberRow = {
  id: string | null;
  company_id: string;
  user_id: string;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
};
export type CompanyMemberInsert = Partial<CompanyMemberRow> & {
  company_id: string;
  user_id: string;
  email: string;
};
export type CompanyMemberUpdate = Partial<CompanyMemberRow>;

export type ConciergeRequestRow = {
  id: string | null;
  trade: string;
  city: string;
  wants: string | null;
  email: string | null;
  lead_id: string | null;
  created_at: string;
};
export type ConciergeRequestInsert = Partial<ConciergeRequestRow> & {
  trade: string;
  city: string;
};
export type ConciergeRequestUpdate = Partial<ConciergeRequestRow>;

export type FinishMediaRow = {
  id: string | null;
  kind: string;
  vertical: string;
  media_key: string;
  src: string;
  alt: string;
  caption: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
export type FinishMediaInsert = Partial<FinishMediaRow> & {
  kind: string;
  media_key: string;
  src: string;
};
export type FinishMediaUpdate = Partial<FinishMediaRow>;

export type ToolVoteRow = {
  id: string | null;
  tool_id: string;
  voter_hash: string;
  trade: string;
  city: string;
  email: string | null;
  created_at: string;
};
export type ToolVoteInsert = Partial<ToolVoteRow> & {
  tool_id: string;
  voter_hash: string;
  trade: string;
  city: string;
};
export type ToolVoteUpdate = Partial<ToolVoteRow>;

export type VerticalRuleDefaultRow = {
  vertical: string | null;
  rules: Json;
  finish_catalogue: Json;
  sqft_min: number;
  sqft_max: number;
  range_spread_pct: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
export type VerticalRuleDefaultInsert = Partial<VerticalRuleDefaultRow> & {
  rules: Json;
  sqft_min: number;
  sqft_max: number;
  range_spread_pct: number;
};
export type VerticalRuleDefaultUpdate = Partial<VerticalRuleDefaultRow>;

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
      ai_spend_alerts: { Row: AiSpendAlertRow; Insert: AiSpendAlertInsert; Update: AiSpendAlertUpdate; Relationships: [] };
      build_log: { Row: BuildLogEntryRow; Insert: BuildLogEntryInsert; Update: BuildLogEntryUpdate; Relationships: [] };
      build_months: { Row: BuildMonthRow; Insert: BuildMonthInsert; Update: BuildMonthUpdate; Relationships: [] };
      companies: { Row: CompanyRow; Insert: CompanyInsert; Update: CompanyUpdate; Relationships: [] };
      company_members: { Row: CompanyMemberRow; Insert: CompanyMemberInsert; Update: CompanyMemberUpdate; Relationships: [] };
      concierge_requests: { Row: ConciergeRequestRow; Insert: ConciergeRequestInsert; Update: ConciergeRequestUpdate; Relationships: [] };
      finish_media: { Row: FinishMediaRow; Insert: FinishMediaInsert; Update: FinishMediaUpdate; Relationships: [] };
      tool_votes: { Row: ToolVoteRow; Insert: ToolVoteInsert; Update: ToolVoteUpdate; Relationships: [] };
      vertical_rule_defaults: { Row: VerticalRuleDefaultRow; Insert: VerticalRuleDefaultInsert; Update: VerticalRuleDefaultUpdate; Relationships: [] };
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
      implementation_requests: { Row: ImplementationRequestRow; Insert: ImplementationRequestInsert; Update: ImplementationRequestUpdate; Relationships: [] };
      site_settings: { Row: SiteSettingRow; Insert: SiteSettingInsert; Update: SiteSettingUpdate; Relationships: [] };
      tool_media: { Row: ToolMediaRow; Insert: ToolMediaInsert; Update: ToolMediaUpdate; Relationships: [] };
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



