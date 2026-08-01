-- ============================================================================
-- 0008_prototype_view.sql — Phase 8 addition to resolve_prototype_full().
--
-- CREATE OR REPLACE FUNCTION is idempotent by nature (redefining a function
-- is not an error the way redefining a table or type is), so this migration
-- needs no special guarding — unlike 0001-0004, but consistent with every
-- function-only migration since.
--
-- WHY THIS EXISTS: Phase 8's hero copy has to name the contractor's market
-- ("Dallas garage floor coating" reads as his site; "instant floor quotes"
-- reads as a demo of mine) — but 0007_admin.sql's resolve_prototype_full()
-- never selected prospects.city/state, because nothing needed them yet. This
-- is the same pattern as Phase 6 adding columns OFFER.md had always implied:
-- a real gap between what an earlier phase specified and what a later phase
-- turned out to need, closed here rather than worked around in application
-- code.
-- ============================================================================

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
      'contact_name', pr.contact_name, 'phone', pr.phone, 'email', pr.email,
      'city', pr.city, 'state', pr.state
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
