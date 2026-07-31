-- ============================================================================
-- seed.sql — Phase 2 seed data. IDEMPOTENT ON PURPOSE: every statement is an
-- upsert or conflict-tolerant insert, because on a phone you WILL run this
-- twice, and the second run must be a no-op, not an error wall.
--
-- Contents: both plans (same upsert as 0002 — either file can run first),
-- four style presets, the admin identity placeholder, and one COMPLETE demo
-- prospect on the Foundation tier — Ramirez Epoxy Coatings, Dallas — with
-- prototype, brand kit, template config, epoxy quote config (realistic
-- Dallas residential pricing, $5.50–$8.50/sqft installed), an active manual
-- subscription, and a mid-period usage counter (18 analyses · 31 leads,
-- matching the OFFER.md §2.1 display example and lib/stubs.ts exactly).
--
-- Fixed UUIDs so docs/RLS_TESTS.md can reference rows by id.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ADMIN IDENTITY — ⚠ UPDATE THIS BEFORE PHASE 6.
-- Replace with the email you will sign into /admin with (ENV.md:
-- ADMIN_ALLOWED_EMAIL must match it).
-- ----------------------------------------------------------------------------
insert into public.app_admins (email, note)
values ('admin@example.com', 'PLACEHOLDER — replace with your real admin email')
on conflict (email) do nothing;

-- ----------------------------------------------------------------------------
-- plans (identical upsert to 0002_billing.sql; safe in any order)
-- ----------------------------------------------------------------------------
insert into public.plans
  (code, name, setup_fee_cents, monthly_cents, analysis_limit_per_month,
   analysis_limit_per_session, features, is_active)
values
  ('foundation', 'Foundation', 50000, 25000, 25, 3, '{
     "quote.deterministic": true,
     "quote.ai_analysis": true,
     "lead.capture": true,
     "quote.share_page": true,
     "brand.style_toggle": true,
     "cure.advisor": false,
     "command_center": false,
     "ai.implementation_review": false
   }'::jsonb, true),
  ('operator', 'Operator', 250000, 50000, null, 3, '{
     "quote.deterministic": true,
     "quote.ai_analysis": true,
     "lead.capture": true,
     "quote.share_page": true,
     "brand.style_toggle": true,
     "cure.advisor": true,
     "command_center": true,
     "ai.implementation_review": true
   }'::jsonb, true)
on conflict (code) do update set
  name = excluded.name,
  setup_fee_cents = excluded.setup_fee_cents,
  monthly_cents = excluded.monthly_cents,
  analysis_limit_per_month = excluded.analysis_limit_per_month,
  analysis_limit_per_session = excluded.analysis_limit_per_session,
  features = excluded.features,
  is_active = excluded.is_active;

-- ----------------------------------------------------------------------------
-- style presets (system)
-- ----------------------------------------------------------------------------
insert into public.style_presets (id, name, template_id, typography_id, button_style_id, style_variant, palette, is_system)
values
  ('a0000000-0000-4000-8000-000000000001', 'Datum Light',
   'template-datum-01', 'archivo-plexmono', 'button-milled', 'light',
   '{"hazard": "#FF6A13", "note": "stock Girder light — DESIGN.md defaults"}'::jsonb, true),
  ('a0000000-0000-4000-8000-000000000002', 'Datum Dark Industrial',
   'template-datum-01', 'archivo-plexmono', 'button-milled', 'dark-industrial',
   '{"hazard": "#FF6A13", "note": "stock Girder dark — control panel voice"}'::jsonb, true),
  ('a0000000-0000-4000-8000-000000000003', 'Datum Light — Warm Accent',
   'template-datum-01', 'archivo-plexmono', 'button-milled', 'light',
   '{"hazard": "#D96A1E", "note": "for brands whose orange runs warmer"}'::jsonb, true),
  ('a0000000-0000-4000-8000-000000000004', 'Datum Dark — Cool Accent',
   'template-datum-01', 'archivo-plexmono', 'button-milled', 'dark-industrial',
   '{"hazard": "#E4552F", "note": "dark variant with softened accent"}'::jsonb, true)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- THE DEMO TENANT — Ramirez Epoxy Coatings (Dallas, TX), Foundation tier
-- ----------------------------------------------------------------------------
insert into public.prospects
  (id, business_name, contact_name, phone, email, city, state, website_url,
   vertical, has_google_ads, google_review_count, estimated_monthly_traffic,
   qualification_score, qualification_notes, status)
values
  ('11111111-1111-4111-8111-111111111111',
   'Ramirez Epoxy Coatings', 'Mike Ramirez', '+12145550137',
   'mike@example.com', 'Dallas', 'TX', 'https://example.com',
   'epoxy', true, 47, 900, 75,
   'Seeded demo tenant. Running Google Ads, 47 reviews, ~900 visits/mo — band: pitch.',
   'customer')
on conflict (id) do update set
  business_name = excluded.business_name,
  status = excluded.status;

insert into public.prototypes
  (id, prospect_id, slug, status, expires_at, tier, subscription_status, vertical)
values
  ('22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111',
   'demoramirezepoxy1',    -- matches STUB_LIVE_SLUG in lib/stubs.ts; hand-minted
                           -- for memorability — real slugs come from lib/slug.ts
   'live', null, 'foundation', 'active', 'epoxy')
on conflict (id) do update set
  slug = excluded.slug,
  status = excluded.status,
  tier = excluded.tier,
  subscription_status = excluded.subscription_status;

insert into public.brand_kits
  (id, prototype_id, logo_path, primary_hex, secondary_hex, accent_hex, extraction_source)
values
  ('33333333-3333-4333-8333-333333333333',
   '22222222-2222-4222-8222-222222222222',
   null, '#1B4B8F', '#14171A', '#D96A1E', 'manual')
on conflict (prototype_id) do update set
  primary_hex = excluded.primary_hex,
  secondary_hex = excluded.secondary_hex,
  accent_hex = excluded.accent_hex;

insert into public.template_configs
  (id, prototype_id, template_id, typography_id, button_style_id, style_variant, copy_overrides)
values
  ('44444444-4444-4444-8444-444444444444',
   '22222222-2222-4222-8222-222222222222',
   'template-datum-01', 'archivo-plexmono', 'button-milled', 'light', '{}'::jsonb)
on conflict (prototype_id) do update set
  template_id = excluded.template_id,
  style_variant = excluded.style_variant;

-- Epoxy pricing rules — EXACTLY the shape lib/verticals/epoxy validates
-- (epoxyPricingRuleSchema, .strict()) and the numbers in lib/stubs.ts:
-- flake $5.50 / metallic $8.50 / solid polyaspartic $6.50 per sqft base,
-- $1.50 prep, bounded condition modifiers, $1,500 minimum, $250
-- mobilization, ±15% quoted range. Dallas residential market shape.
insert into public.quote_configs
  (id, prototype_id, vertical, rules, finish_catalogue, sqft_min, sqft_max, range_spread_pct)
values
  ('55555555-5555-4555-8555-555555555555',
   '22222222-2222-4222-8222-222222222222',
   'epoxy',
   '{
      "baseRateCentsPerSqft": { "flake": 550, "metallic": 850, "solid_polyaspartic": 650 },
      "prepRateCentsPerSqft": 150,
      "conditionModifiers": [
        { "id": "oil_heavy",         "label": "Heavy oil contamination",     "pctAdjust": 0.18 },
        { "id": "cracking_moderate", "label": "Moderate cracking repair",    "pctAdjust": 0.12 },
        { "id": "previous_coating",  "label": "Previous coating removal",    "pctAdjust": 0.25 }
      ],
      "minimumJobCents": 150000,
      "mobilizationFeeCents": 25000,
      "rangeSpreadPct": 0.15
    }'::jsonb,
   '{
      "finishes": [
        { "id": "decorative_flakes",  "label": "Decorative Flakes",  "tierKey": "flake" },
        { "id": "metallic_epoxy",     "label": "Metallic Epoxy",     "tierKey": "metallic" },
        { "id": "solid_polyaspartic", "label": "Solid Polyaspartic", "tierKey": "solid_polyaspartic" }
      ],
      "note": "Display colours come from the vertical module; this catalogue maps availability + tier."
    }'::jsonb,
   100, 6000, 0.150)
on conflict (prototype_id, vertical) do update set
  rules = excluded.rules,
  finish_catalogue = excluded.finish_catalogue,
  sqft_min = excluded.sqft_min,
  sqft_max = excluded.sqft_max,
  range_spread_pct = excluded.range_spread_pct;

-- Active manual-provider subscription (period matches lib/stubs.ts)
insert into public.subscriptions
  (id, prospect_id, prototype_id, plan_code, provider, status,
   current_period_start, current_period_end)
values
  ('66666666-6666-4666-8666-666666666666',
   '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   'foundation', 'manual', 'active',
   '2026-07-14T00:00:00Z', '2026-08-14T00:00:00Z')
on conflict (id) do update set
  status = excluded.status,
  current_period_start = excluded.current_period_start,
  current_period_end = excluded.current_period_end;

-- Setup payment on record ($500, manual)
insert into public.payments
  (id, subscription_id, provider_payment_id, kind, amount_cents, currency, status, occurred_at)
values
  ('88888888-8888-4888-8888-888888888888',
   '66666666-6666-4666-8666-666666666666',
   'manual-seed-setup-001', 'setup', 50000, 'usd', 'succeeded',
   '2026-07-14T00:00:00Z')
on conflict (id) do nothing;

-- Mid-period usage: 18 of 25 analyses · 31 leads (OFFER.md §2.1 example)
insert into public.usage_counters
  (id, prototype_id, period_start, period_end, analyses_used, leads_captured)
values
  ('77777777-7777-4777-8777-777777777777',
   '22222222-2222-4222-8222-222222222222',
   '2026-07-14T00:00:00Z', '2026-08-14T00:00:00Z', 18, 31)
on conflict (prototype_id, period_start) do update set
  analyses_used = excluded.analyses_used,
  leads_captured = excluded.leads_captured;
