-- ============================================================================
-- 0003_rls.sql — ROW LEVEL SECURITY (Phase 2)
--
-- THE ACCESS MODEL, stated once:
--   service_role  — bypasses RLS by design (Supabase). It is the ONLY writer
--                   of billing state (subscriptions, payments, usage_counters,
--                   dunning_events, webhook_events, prototypes.tier/
--                   subscription_status) — used exclusively by the webhook
--                   path and explicit admin server actions (lib/supabase/
--                   admin.ts). It is never used to bypass tenancy for
--                   user-facing reads (CONVENTIONS.md).
--   admin         — an AUTHENTICATED user whose email is in app_admins.
--                   Full access to every table via is_admin() policies.
--                   Phase 6 wires Supabase Auth sign-in; the policies are
--                   already live and waiting.
--   anon          — may INSERT leads, quotes, demo_sessions, analytics_events
--                   (with WITH CHECK guards); may read ACTIVE plans; and may
--                   read tenant data ONLY through two SECURITY DEFINER
--                   functions that answer by unguessable key.
--
-- WHY FUNCTIONS INSTEAD OF anon SELECT POLICIES ON TENANT TABLES:
-- a policy like `USING (status = 'live')` on prototypes would let anyone
-- holding the public anon key run `select * from prototypes` and ENUMERATE
-- every customer's slug, tier, and billing state. The spec's "anonymous may
-- read config only for an active prototype slug" describes point lookup by
-- secret, not row filtering — so the tables stay sealed (hard privilege
-- denial, error 42501) and two functions answer exactly one record per
-- unguessable key. Enumeration is impossible because there is no listable
-- surface at all.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- admin identity
-- ----------------------------------------------------------------------------
create table public.app_admins (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

-- SECURITY DEFINER so policies can consult app_admins regardless of the
-- caller's own privileges on it. search_path pinned against hijack.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.app_admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- ----------------------------------------------------------------------------
-- enable RLS everywhere (deny-by-default; policies open narrow doors)
-- ----------------------------------------------------------------------------
alter table public.prospects         enable row level security;
alter table public.prototypes        enable row level security;
alter table public.brand_kits        enable row level security;
alter table public.template_configs  enable row level security;
alter table public.quote_configs     enable row level security;
alter table public.quotes            enable row level security;
alter table public.leads             enable row level security;
alter table public.demo_sessions     enable row level security;
alter table public.analytics_events  enable row level security;
alter table public.ai_jobs           enable row level security;
alter table public.style_presets     enable row level security;
alter table public.plans             enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.payments          enable row level security;
alter table public.usage_counters    enable row level security;
alter table public.dunning_events    enable row level security;
alter table public.webhook_events    enable row level security;
alter table public.app_admins        enable row level security;

-- ----------------------------------------------------------------------------
-- hard privilege revocation for anon
-- Supabase grants broad table privileges to anon/authenticated by default;
-- with RLS alone a denied SELECT returns an empty 200. Revoking the
-- privilege turns "anonymous NEVER reads X" into an unambiguous 42501
-- error — which is also what docs/RLS_TESTS.md asserts.
-- ----------------------------------------------------------------------------
revoke all on public.prospects,
              public.prototypes,
              public.brand_kits,
              public.template_configs,
              public.quote_configs,
              public.quotes,
              public.leads,
              public.demo_sessions,
              public.analytics_events,
              public.ai_jobs,
              public.style_presets,
              public.plans,
              public.subscriptions,
              public.payments,
              public.usage_counters,
              public.dunning_events,
              public.webhook_events,
              public.app_admins
from anon;

-- ...then grant back ONLY what the model above allows anon to do directly.
grant insert on public.leads            to anon;
grant insert on public.quotes           to anon;
grant insert on public.demo_sessions    to anon;
grant insert on public.analytics_events to anon;
grant select on public.plans            to anon;

-- NOTE (documented deviation from the phase prompt's letter, compliant with
-- the canonical docs): the prompt lists "plans internals" as never-readable
-- by anon, but SPEC R-209 requires /pricing to render tiers FROM the plans
-- table and CONVENTIONS.md forbids using the service role to bypass RLS for
-- public reads. Every field on an ACTIVE plan is public sales content — the
-- price and the limits ARE the pricing page. Resolution: anon may read
-- active plans only; retired plans stay hidden.

-- ----------------------------------------------------------------------------
-- admin policies — full access on every table for is_admin()
-- (authenticated keeps its default table privileges; these policies are what
-- make rows visible/writable, and only for the admin identity.)
-- ----------------------------------------------------------------------------
create policy admin_all on public.prospects        for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.prototypes       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.brand_kits       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.template_configs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.quote_configs    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.quotes           for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.leads            for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.demo_sessions    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.analytics_events for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.ai_jobs          for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.style_presets    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.plans            for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.subscriptions    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.payments         for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.usage_counters   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.dunning_events   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.webhook_events   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.app_admins       for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- anon write policies (the four permitted inserts), each with a WITH CHECK
-- that pins writes to a live prototype or to no prototype at all — an
-- attacker with the anon key cannot attach rows to a draft/revoked tenant.
-- App code MUST NOT chain .select() on these inserts (no SELECT privilege;
-- supabase-js defaults to return=minimal, keep it that way).
--
-- prototype_is_live() is SECURITY DEFINER because a policy subquery runs
-- with the CALLER's privileges — and anon deliberately has none on
-- prototypes. Verified in-container: an inline `exists (select … from
-- prototypes)` here fails every permitted insert with "permission denied
-- for table prototypes". The helper reveals exactly one bit about a UUID
-- the caller must already possess; the table stays sealed.
-- ----------------------------------------------------------------------------
create or replace function public.prototype_is_live(p_prototype_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.prototypes p
    where p.id = p_prototype_id
      and p.status = 'live'
      and (p.expires_at is null or p.expires_at > now())
  );
$$;

revoke execute on function public.prototype_is_live(uuid) from public;
grant execute on function public.prototype_is_live(uuid) to anon, authenticated;

create policy anon_insert_leads on public.leads
  for insert to anon
  with check (prototype_id is null or public.prototype_is_live(prototype_id));

create policy anon_insert_quotes on public.quotes
  for insert to anon
  with check (prototype_id is null or public.prototype_is_live(prototype_id));

create policy anon_insert_demo_sessions on public.demo_sessions
  for insert to anon
  with check (prototype_id is null or public.prototype_is_live(prototype_id));

create policy anon_insert_analytics on public.analytics_events
  for insert to anon
  with check (prototype_id is null or public.prototype_is_live(prototype_id));

-- anon read: active plans only (see deviation note above)
create policy anon_read_active_plans on public.plans
  for select to anon
  using (is_active = true);

-- Same policies for authenticated non-admin visitors (a signed-in admin who
-- signs out mid-session, a future auth'd surface): identical narrow doors.
create policy authed_insert_leads on public.leads
  for insert to authenticated
  with check (prototype_id is null or public.prototype_is_live(prototype_id));

create policy authed_read_active_plans on public.plans
  for select to authenticated
  using (is_active = true or public.is_admin());

-- ----------------------------------------------------------------------------
-- THE TWO PUBLIC READ FUNCTIONS — point lookup by unguessable key only
-- ----------------------------------------------------------------------------

-- Resolves one LIVE prototype by slug into the exact payload the branded
-- page needs: branding + template + quote config. Deliberately EXCLUDED:
-- tier, subscription_status, prospect fields — billing state never rides a
-- public payload. Expired/revoked/draft return null (the route 404s);
-- Phase 8's designed "expired" page distinguishes states server-side via
-- the admin client, not through this function.
create or replace function public.resolve_prototype_by_slug(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'prototype', jsonb_build_object(
      'id', p.id,
      'slug', p.slug,
      'vertical', p.vertical
    ),
    'brand_kit', case when bk.id is null then null else jsonb_build_object(
      'logo_path', bk.logo_path,
      'primary_hex', bk.primary_hex,
      'secondary_hex', bk.secondary_hex,
      'accent_hex', bk.accent_hex,
      'derived_tokens', bk.derived_tokens
    ) end,
    'template_config', case when tc.id is null then null else jsonb_build_object(
      'template_id', tc.template_id,
      'typography_id', tc.typography_id,
      'button_style_id', tc.button_style_id,
      'style_variant', tc.style_variant,
      'copy_overrides', tc.copy_overrides
    ) end,
    'quote_config', case when qc.id is null then null else jsonb_build_object(
      'vertical', qc.vertical,
      'rules', qc.rules,
      'finish_catalogue', qc.finish_catalogue,
      'sqft_min', qc.sqft_min,
      'sqft_max', qc.sqft_max,
      'range_spread_pct', qc.range_spread_pct
    ) end
  )
  from public.prototypes p
  left join public.brand_kits bk       on bk.prototype_id = p.id
  left join public.template_configs tc on tc.prototype_id = p.id
  left join public.quote_configs qc    on qc.prototype_id = p.id
                                      and qc.vertical = p.vertical
  where p.slug = p_slug
    and p.status = 'live'
    and (p.expires_at is null or p.expires_at > now());
$$;

-- One quote by its unguessable public id. photo_path deliberately excluded:
-- the private-bucket path is server business (signed URLs, Phase 4+).
create or replace function public.get_quote_by_public_id(p_public_id text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'public_id', q.public_id,
    'prototype_id', q.prototype_id,
    'vertical', q.vertical,
    'inputs', q.inputs,
    'low_cents', q.low_cents,
    'high_cents', q.high_cents,
    'breakdown', q.breakdown,
    'used_ai_analysis', q.used_ai_analysis,
    'created_at', q.created_at
  )
  from public.quotes q
  where q.public_id = p_public_id;
$$;

-- ----------------------------------------------------------------------------
-- function execution rights
-- ----------------------------------------------------------------------------
-- Public point-lookups + the two session helpers from 0001 (safe by
-- construction: single row addressed by unguessable session_id, bounded
-- effect, counter can only move toward its limit).
revoke execute on function public.resolve_prototype_by_slug(text) from public;
revoke execute on function public.get_quote_by_public_id(text) from public;
revoke execute on function public.touch_demo_session(text, session_surface, uuid, text, boolean) from public;
revoke execute on function public.increment_session_analyses(text, integer) from public;

grant execute on function public.resolve_prototype_by_slug(text) to anon, authenticated;
grant execute on function public.get_quote_by_public_id(text) to anon, authenticated;
grant execute on function public.touch_demo_session(text, session_surface, uuid, text, boolean) to anon, authenticated;
grant execute on function public.increment_session_analyses(text, integer) to anon, authenticated;

-- Billing-adjacent functions: SERVICE ROLE ONLY ("service role only for all
-- billing writes"). Neither anon nor authenticated may execute.
revoke execute on function public.increment_usage(uuid, timestamptz, timestamptz, text, integer) from public, anon, authenticated;
revoke execute on function public.get_usage(uuid, timestamptz) from public, anon, authenticated;
