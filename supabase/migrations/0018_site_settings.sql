-- ============================================================================
-- 0018_site_settings.sql — SETTINGS YOU CHANGE WITHOUT A DEPLOY (Phase 16D)
--
-- ============================================================================
-- WHY A TABLE AND NOT AN ENVIRONMENT VARIABLE
-- ============================================================================
--
-- The brief is that the theme is switched from admin and changes for everyone
-- the moment it is switched. An env var cannot do that: changing one in Vercel
-- requires a redeploy, which takes minutes and rebuilds the whole site to flip
-- one word. A row can be updated in one request.
--
-- ============================================================================
-- ONE ROW, ENFORCED. THIS IS THE PART THAT MATTERS.
-- ============================================================================
--
-- A key/value settings table with no constraint on cardinality is a table that
-- eventually holds two rows for the same key, and then the site's appearance
-- depends on which one the query happens to return first. The primary key on
-- `key` makes that impossible: an upsert can only ever replace.
--
-- Defaults are seeded here rather than left to application code. A settings
-- read that has to cope with "no row yet" grows a fallback in every caller, and
-- those fallbacks drift. There is always a row.
--
-- ============================================================================
-- SCOPE — DO NOT LET THIS BECOME A JUNK DRAWER
-- ============================================================================
--
-- This table is for SITE-WIDE PRESENTATION choices that one operator flips and
-- every visitor sees. It is not for per-tenant configuration (that is
-- `companies` and the prototype's own settings), not for secrets (env vars,
-- which are not readable by the anon role), and not for feature flags that
-- should be decided per request.
--
-- The value column is text, not jsonb, on purpose: a settings row that can hold
-- a nested object is a settings row that will, and then this table is a schema
-- nobody designed. If a setting needs structure, it needs its own table.
-- ============================================================================

create table public.site_settings (
  key text primary key,
  value text not null check (char_length(value) between 1 and 200),
  updated_at timestamptz not null default now()
);

-- The theme. 'light' is the default and the shipped default is deliberate:
-- the site is read in daylight, on a phone, on a job site.
insert into public.site_settings (key, value) values ('theme', 'light');

-- ----------------------------------------------------------------------------
-- RLS
--
-- READ IS PUBLIC, and that is correct rather than careless. The value of the
-- theme row is visible to every visitor the instant the page paints — it IS the
-- page's appearance. There is nothing to protect, and making it admin-only
-- would force the theme read through the service-role client on every render.
--
-- WRITE IS ADMIN ONLY. anon has no insert, update or delete policy at all, so
-- a visitor cannot restyle the site for everybody else.
--
-- The length check is what keeps a compromised admin session from turning this
-- into a text sink; the application maps the value onto a closed set of two
-- before it is ever used, so an unexpected string renders as the default rather
-- than as anything at all — see lib/site/theme.ts.
-- ----------------------------------------------------------------------------

alter table public.site_settings enable row level security;

create policy site_settings_public_read
  on public.site_settings
  for select
  to anon, authenticated
  using (true);

create policy site_settings_admin_write
  on public.site_settings
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
