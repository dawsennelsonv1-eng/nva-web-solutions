-- ============================================================================
-- 0001_init.sql — CORE SCHEMA (Phase 2)
-- Canonical source: docs/DATA_MODEL.md §§1–11. This file translates that
-- document into DDL; where they disagree, DATA_MODEL.md wins and this file
-- is the defect.
-- Run order: 0001 → 0002 → 0003 → 0004 → seed.sql
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto (pre-installed on Supabase).
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- enums (string-literal unions in types/database.ts mirror these exactly)
-- ----------------------------------------------------------------------------
create type prospect_status as enum
  ('new','qualified','declined','pitched','customer','churned');

create type prototype_status as enum
  ('draft','live','expired','revoked');

create type extraction_source as enum
  ('client_canvas','server','manual');

create type style_variant as enum
  ('light','dark-industrial');

create type lead_source as enum
  ('public_hub','demo','prototype','direct');

create type lead_status as enum
  ('new','contacted','qualified','dead');

-- Exactly three values BY DESIGN (DATA_MODEL.md §7): 'session_limit' is a
-- runtime decision reason, never a persisted lead state — hitting the
-- per-session analysis limit still completes the deterministic quote, so the
-- lead is not degraded.
create type degraded_reason as enum
  ('cap_reached','subscription_suspended','ai_unavailable');

create type session_surface as enum
  ('public_hub','demo','prototype','admin');

create type ai_job_status as enum
  ('succeeded','failed','invalid_output');

-- ----------------------------------------------------------------------------
-- updated_at trigger (shared)
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. prospects — the contractor business (DATA_MODEL.md §1)
-- ----------------------------------------------------------------------------
create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text,
  phone text,                     -- E.164; surfaces in degraded-mode copy
  email text,
  city text,
  state text,
  website_url text,
  vertical text not null default 'epoxy',  -- registry id, not an enum: verticals are code-registered
  -- qualification (nullable = unassessed, which is different from false)
  has_google_ads boolean,
  google_review_count integer,
  estimated_monthly_traffic integer,
  qualification_score integer,    -- stored, not derived: a scoring change must not rewrite history
  qualification_notes text,
  status prospect_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger prospects_updated_at before update on public.prospects
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. prototypes — one staged branded environment (DATA_MODEL.md §2)
-- ----------------------------------------------------------------------------
create table public.prototypes (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  slug text not null unique,      -- unguessable; entropy justified in lib/slug.ts
  status prototype_status not null default 'draft',  -- only 'live' resolves publicly
  expires_at timestamptz,         -- null = no expiry
  tier text,                      -- fk → plans.code added in 0002 (plans created there)
  -- Denormalised mirror of the active subscription's status for one-query
  -- public reads. WRITTEN ONLY BY THE WEBHOOK PATH. Never authoritative —
  -- lib/entitlements/check.ts resolves the real answer from subscriptions.
  subscription_status text,
  vertical text not null default 'epoxy',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index prototypes_prospect_idx on public.prototypes (prospect_id);
create index prototypes_status_idx on public.prototypes (status);

create trigger prototypes_updated_at before update on public.prototypes
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. brand_kits (DATA_MODEL.md §3) — one kit per prototype
-- ----------------------------------------------------------------------------
create table public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  prototype_id uuid not null unique references public.prototypes(id) on delete cascade,
  logo_path text,                 -- Supabase Storage path in the 'logos' bucket
  primary_hex text,
  secondary_hex text,
  accent_hex text,
  derived_tokens jsonb,           -- full expanded token set incl. dark variant (Phase 7)
  pinned_tokens jsonb,            -- manual overrides that survive re-extraction
  extraction_source extraction_source not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger brand_kits_updated_at before update on public.brand_kits
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. template_configs (DATA_MODEL.md §4)
-- ----------------------------------------------------------------------------
create table public.template_configs (
  id uuid primary key default gen_random_uuid(),
  prototype_id uuid not null unique references public.prototypes(id) on delete cascade,
  template_id text not null,
  typography_id text not null,
  button_style_id text not null,
  style_variant style_variant not null default 'light',
  copy_overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger template_configs_updated_at before update on public.template_configs
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. quote_configs — the single source of every number in a quote
--    (DATA_MODEL.md §5; shape of `rules` validated by the vertical's Zod
--    schema at the application boundary, e.g. epoxyPricingRuleSchema)
-- ----------------------------------------------------------------------------
create table public.quote_configs (
  id uuid primary key default gen_random_uuid(),
  prototype_id uuid not null references public.prototypes(id) on delete cascade,
  vertical text not null,
  rules jsonb not null,           -- base rates, prep, modifiers, minimum, mobilisation
  finish_catalogue jsonb not null,
  sqft_min integer not null check (sqft_min > 0),
  sqft_max integer not null,
  range_spread_pct numeric(4,3) not null check (range_spread_pct between 0.05 and 0.5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sqft_max > sqft_min),
  unique (prototype_id, vertical)
);

create trigger quote_configs_updated_at before update on public.quote_configs
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. quotes — a completed calculation, persisted for /q/[quoteId]
--    (DATA_MODEL.md §6)
-- ----------------------------------------------------------------------------
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique, -- unguessable; THIS is the URL, never the uuid
  prototype_id uuid references public.prototypes(id) on delete set null, -- null = /demo quote
  vertical text not null,
  inputs jsonb not null,          -- incl. per-field provenance: vision vs user
  low_cents integer not null check (low_cents >= 0),
  high_cents integer not null check (high_cents >= low_cents),
  breakdown jsonb not null,
  photo_path text,                -- Storage path in 'floor-photos'; null = no photo
  used_ai_analysis boolean not null default false,
  was_capped boolean not null default false,
  session_id text,
  created_at timestamptz not null default now()
);

create index quotes_prototype_idx on public.quotes (prototype_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 7. leads — the most important table in the system (DATA_MODEL.md §7)
-- ----------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  source lead_source not null,
  prototype_id uuid references public.prototypes(id) on delete set null, -- null = /demo lead (OUR inbound)
  -- NULLABLE BY DESIGN: a degraded lead has no quote row because no price
  -- was calculated. Code that assumes this is present is a defect.
  quote_id uuid references public.quotes(id) on delete set null,
  name text not null,
  phone text not null,
  email text not null,
  timeline text,
  was_degraded boolean not null default false,
  degraded_reason degraded_reason,
  routed_at timestamptz,
  delivery_status jsonb not null default '{}'::jsonb, -- per-channel outcome; a failure here never fails the lead write
  status lead_status not null default 'new',
  notes text,
  created_at timestamptz not null default now(),
  -- degraded_reason non-null IFF was_degraded (DATA_MODEL.md §7)
  check ((was_degraded and degraded_reason is not null)
      or (not was_degraded and degraded_reason is null))
);

create index leads_prototype_idx on public.leads (prototype_id, created_at desc);
create index leads_status_idx on public.leads (status);

-- ----------------------------------------------------------------------------
-- 8. demo_sessions — funnel truth + per-session analysis limit enforcement
--    (DATA_MODEL.md §8). analyses_used_this_session is SERVER-AUTHORITATIVE:
--    no anonymous write path exists (see 0003); mutations go through the
--    SECURITY DEFINER functions below it.
-- ----------------------------------------------------------------------------
create table public.demo_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,  -- anonymous, client-generated, no PII
  prototype_id uuid references public.prototypes(id) on delete set null,
  surface session_surface not null,
  step_progression jsonb not null default '[]'::jsonb, -- ordered [{step, at}]
  abandoned_at timestamptz,
  abandoned_step text,              -- the most valuable field for post-launch decisions
  analyses_used_this_session integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger demo_sessions_updated_at before update on public.demo_sessions
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 9. analytics_events (DATA_MODEL.md §9)
-- ----------------------------------------------------------------------------
create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,        -- typed at the emitter (lib/analytics.ts), free at the DB
  session_id text,
  prototype_id uuid references public.prototypes(id) on delete set null,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index analytics_events_name_idx on public.analytics_events (event_name, occurred_at desc);
create index analytics_events_proto_idx on public.analytics_events (prototype_id, occurred_at desc);

-- ----------------------------------------------------------------------------
-- 10. ai_jobs — every paid model call (DATA_MODEL.md §10)
--     Commercial rule R-613: only status='succeeded' may correspond to a
--     quota decrement; 'failed' and 'invalid_output' must not.
-- ----------------------------------------------------------------------------
create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  prototype_id uuid references public.prototypes(id) on delete set null,
  job_type text not null default 'vision_analysis',
  provider text not null,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  cost_cents integer,              -- computed at write time; stored, not derived — rates change
  status ai_job_status not null,
  error text,
  created_at timestamptz not null default now()
);

create index ai_jobs_created_idx on public.ai_jobs (created_at desc);
create index ai_jobs_proto_idx on public.ai_jobs (prototype_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 11. style_presets (DATA_MODEL.md §11)
-- ----------------------------------------------------------------------------
create table public.style_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_id text not null,
  typography_id text not null,
  button_style_id text not null,
  style_variant style_variant not null default 'light',
  palette jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- session helpers — SECURITY DEFINER so the anon role can progress its own
-- session WITHOUT holding UPDATE on demo_sessions (which would let any holder
-- of the public anon key vandalise other sessions or reset its own analysis
-- counter). Each function touches exactly one row addressed by the
-- unguessable session_id and only the columns it names.
-- ----------------------------------------------------------------------------
create or replace function public.touch_demo_session(
  p_session_id text,
  p_surface session_surface,
  p_prototype_id uuid default null,
  p_step text default null,
  p_abandoned boolean default false
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.demo_sessions (session_id, surface, prototype_id)
  values (p_session_id, p_surface, p_prototype_id)
  on conflict (session_id) do nothing;

  if p_step is not null then
    update public.demo_sessions
       set step_progression = step_progression
             || jsonb_build_object('step', p_step, 'at', now()),
           abandoned_at   = case when p_abandoned then now() else abandoned_at end,
           abandoned_step = case when p_abandoned then p_step else abandoned_step end
     where session_id = p_session_id;
  elsif p_abandoned then
    update public.demo_sessions
       set abandoned_at = now()
     where session_id = p_session_id;
  end if;
end;
$$;

-- Atomic per-session analysis counter. Returns the NEW count so Phase 3 can
-- enforce the 3-per-session limit in one round trip: increment happens only
-- if still under the limit; at/over the limit the current count returns
-- unchanged and the caller reads "not allowed" from the value.
create or replace function public.increment_session_analyses(
  p_session_id text,
  p_limit integer
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new integer;
begin
  update public.demo_sessions
     set analyses_used_this_session = analyses_used_this_session + 1
   where session_id = p_session_id
     and analyses_used_this_session < p_limit
  returning analyses_used_this_session into v_new;

  if v_new is null then
    select analyses_used_this_session into v_new
      from public.demo_sessions where session_id = p_session_id;
  end if;

  return coalesce(v_new, 0);
end;
$$;
