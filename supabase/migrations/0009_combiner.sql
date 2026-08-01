-- ============================================================================
-- 0009_combiner.sql — STAGING TABLE + ADMIN RESOLVER (Phase 9)
--
-- prototype_previews HOLDS THE "UNSAVED" HALF OF THE COMBINER'S CONTRACT.
-- The phase brief requires the live preview to show "staged UNSAVED config"
-- in the actual /s/[slug] rendering path. Unsaved cannot mean "written to
-- brand_kits/template_configs" — that IS saved, by definition. So staged
-- brand/template choices live here, in a table the real public resolver
-- (0008's resolve_prototype_full, used by /s/[slug] itself) never reads
-- from, and deployPrototypeAction is the ONLY path that ever copies a row
-- from here into the real tables.
--
-- ONE ROW PER PROTOTYPE (prototype_id UNIQUE, upserted): a single admin
-- operator stages one thing at a time per prospect, so there is no need for
-- the session/token complexity a multi-editor tool would require. The
-- preview ROUTE is gated by requireAdmin(), not by a secret token — unlike
-- the public anon-facing resolvers, there is no anonymous caller this needs
-- to hide from.
--
-- expires_at (4 hours) bounds an abandoned combiner session; nothing reads
-- an expired row (the resolver checks it) and a housekeeping sweep is a
-- Phase 12B concern, not this one — matching the same "nothing to clean up
-- yet" reasoning the floor-photos retention note used in Phase 6.
-- ============================================================================

create table if not exists public.prototype_previews (
  id uuid primary key default gen_random_uuid(),
  prototype_id uuid not null unique references public.prototypes(id) on delete cascade,
  staged_brand jsonb not null,     -- { primaryHex, secondaryHex, accentHex, logoPath, derivedTokens, pinnedTokens }
  staged_template jsonb not null,  -- { templateId, typographyId, buttonStyleId, styleVariant }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '4 hours')
);

drop trigger if exists prototype_previews_updated_at on public.prototype_previews;
create trigger prototype_previews_updated_at before update on public.prototype_previews
  for each row execute function public.set_updated_at();

alter table public.prototype_previews enable row level security;
revoke all on public.prototype_previews from anon, authenticated;

drop policy if exists admin_all on public.prototype_previews;
create policy admin_all on public.prototype_previews
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- resolve_prototype_full_by_id — identical shape to 0008's
-- resolve_prototype_full, addressed by id instead of slug, and WITHOUT the
-- status/expiry filtering that function's TypeScript caller applies (the
-- combiner must be able to open a DRAFT prototype that has never gone live —
-- that is the normal case for a prospect being staged for the first time).
--
-- Still service-role only: the combiner's own server actions call it, never
-- the browser directly, and it carries the same subscription/plan data
-- resolve_prototype_full does — appropriate for an admin tool, not for a
-- public route.
-- ----------------------------------------------------------------------------
create or replace function public.resolve_prototype_full_by_id(p_prototype_id uuid)
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
      'derived_tokens', bk.derived_tokens, 'pinned_tokens', bk.pinned_tokens
    ) end,
    'template_config', case when tc.id is null then null else jsonb_build_object(
      'template_id', tc.template_id, 'typography_id', tc.typography_id,
      'button_style_id', tc.button_style_id, 'style_variant', tc.style_variant,
      'copy_overrides', tc.copy_overrides
    ) end,
    'quote_config', case when qc.id is null then null else jsonb_build_object(
      'vertical', qc.vertical, 'rules', qc.rules, 'finish_catalogue', qc.finish_catalogue,
      'sqft_min', qc.sqft_min, 'sqft_max', qc.sqft_max, 'range_spread_pct', qc.range_spread_pct
    ) end
  )
  from public.prototypes p
  join public.prospects pr on pr.id = p.prospect_id
  left join public.brand_kits bk on bk.prototype_id = p.id
  left join public.template_configs tc on tc.prototype_id = p.id
  left join public.quote_configs qc on qc.prototype_id = p.id and qc.vertical = p.vertical
  where p.id = p_prototype_id;
$$;

revoke execute on function public.resolve_prototype_full_by_id(uuid) from public, anon, authenticated;
