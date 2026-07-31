-- ============================================================================
-- 0007_admin.sql — QUALIFICATION SCORECARD COLUMNS + resolve_prototype_full
-- (Phase 6). IDEMPOTENT throughout, like 0005/0006.
--
-- PART 1 closes a real gap between OFFER.md §7 (Phase 0) and 0001_init.sql
-- (Phase 2): three of the scorecard's signals were never given columns —
-- search rank, whether the site already has a quote/pricing tool, and
-- whether the site looks abandoned. They were marked "derived" in OFFER.md
-- because Phase 0 assumed a later phase would decide how to capture them.
-- This is that phase.
-- ============================================================================

do $$ begin
  create type google_search_rank as enum ('page_1', 'page_2', 'not_ranking', 'unknown');
exception when duplicate_object then null;
end $$;

alter table public.prospects
  add column if not exists google_search_rank google_search_rank not null default 'unknown',
  add column if not exists has_quote_or_pricing_tool boolean,
  add column if not exists site_looks_abandoned boolean;

comment on column public.prospects.google_search_rank is
  'OFFER.md §7 signal: search rank for "epoxy garage floor [city]". unknown = not yet assessed, scores 0.';
comment on column public.prospects.has_quote_or_pricing_tool is
  'OFFER.md §7 signal (inverted upside): true if the site ALREADY has a quote form or price info — reduces the score, since a site with none has more upside from this product.';
comment on column public.prospects.site_looks_abandoned is
  'OFFER.md §7 signal: dead, parked, or not updated in 3+ years.';

-- ----------------------------------------------------------------------------
-- PART 2 — resolve_prototype_full(): every raw material lib/prototype.ts
-- needs for one page render, in one round trip. SERVICE ROLE ONLY — unlike
-- 0003's resolve_prototype_by_slug (anon-safe, deliberately excludes
-- billing), this one DOES return subscription/plan/usage data, because the
-- caller is our own server code computing an entitlement decision, not a
-- browser. Its OUTPUT to the browser is filtered by lib/prototype.ts, not by
-- this function — the boundary is application code, same as
-- lib/entitlements/check.ts already trusts application code to filter what
-- a decision exposes.
-- ----------------------------------------------------------------------------
create or replace function public.resolve_prototype_full(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'prototype', jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'vertical', p.vertical, 'status', p.status,
      'expires_at', p.expires_at
    ),
    'prospect', jsonb_build_object(
      'id', pr.id, 'business_name', pr.business_name,
      'contact_name', pr.contact_name, 'phone', pr.phone, 'email', pr.email
    ),
    'brand_kit', case when bk.id is null then null else jsonb_build_object(
      'logo_path', bk.logo_path, 'primary_hex', bk.primary_hex,
      'secondary_hex', bk.secondary_hex, 'accent_hex', bk.accent_hex,
      'derived_tokens', bk.derived_tokens
    ) end,
    'template_config', case when tc.id is null then null else jsonb_build_object(
      'template_id', tc.template_id, 'typography_id', tc.typography_id,
      'button_style_id', tc.button_style_id, 'style_variant', tc.style_variant,
      'copy_overrides', tc.copy_overrides
    ) end,
    'quote_config', case when qc.id is null then null else jsonb_build_object(
      'vertical', qc.vertical, 'rules', qc.rules, 'finish_catalogue', qc.finish_catalogue,
      'sqft_min', qc.sqft_min, 'sqft_max', qc.sqft_max, 'range_spread_pct', qc.range_spread_pct
    ) end,
    'subscription', case when s.id is null then null else jsonb_build_object(
      'status', s.status, 'plan_code', s.plan_code,
      'current_period_start', s.current_period_start, 'current_period_end', s.current_period_end
    ) end,
    'plan', case when pl.code is null then null else jsonb_build_object(
      'analysis_limit_per_month', pl.analysis_limit_per_month,
      'analysis_limit_per_session', pl.analysis_limit_per_session,
      'features', pl.features
    ) end,
    'usage', case when uc.id is null then null else jsonb_build_object(
      'analyses_used', uc.analyses_used, 'leads_captured', uc.leads_captured
    ) end
  )
  from public.prototypes p
  join public.prospects pr on pr.id = p.prospect_id
  left join public.brand_kits bk on bk.prototype_id = p.id
  left join public.template_configs tc on tc.prototype_id = p.id
  left join public.quote_configs qc on qc.prototype_id = p.id and qc.vertical = p.vertical
  left join lateral (
    select * from public.subscriptions
     where prototype_id = p.id
     order by created_at desc limit 1
  ) s on true
  left join public.plans pl on pl.code = s.plan_code
  left join public.usage_counters uc
    on uc.prototype_id = p.id and uc.period_start = s.current_period_start
  where p.slug = p_slug;
$$;

revoke execute on function public.resolve_prototype_full(text) from public, anon, authenticated;
