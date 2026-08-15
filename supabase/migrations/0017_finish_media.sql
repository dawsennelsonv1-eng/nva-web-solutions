-- ============================================================================
-- 0017_finish_media.sql — THE TABLE THAT EXISTED ONLY IN PRODUCTION (Phase 42)
--
-- WHAT THIS FIXES, AND IT IS NOT A FEATURE. `public.finish_media` is read and
-- written by lib/finishes/media.ts, app/actions/finishMedia.ts, the finish
-- picker, the swatch studio and the combination studio. It is load-bearing for
-- the entire finish preview.
--
-- It was created in no migration. A grep across supabase/migrations/ for
-- `finish_media` returns nothing: the table was brought into being by hand,
-- directly against the live database, and the repository has never known about
-- it.
--
-- WHY THAT IS SERIOUS RATHER THAN UNTIDY. The migrations folder is the only
-- statement of what this schema IS. Anything not in it exists at the mercy of
-- one Supabase project continuing to hold state nobody can reconstruct:
--
--   * A fresh environment — staging, a rebuild, a second region, a new
--     developer running the migrations locally — comes up WITHOUT this table.
--     Every read in lib/finishes/media.ts is wrapped in try/catch returning []
--     or false, by design, so nothing crashes. The picker simply shows "no
--     reference photo of this exact combination yet" for every combination for
--     ever, and the swatch studio reports that each save failed. The
--     environment looks like it works and is silently missing a feature.
--   * A restore from a migration-based rebuild loses it entirely.
--   * Nobody reviewing the schema can see the columns, the constraints, or the
--     RLS posture of a table that holds operator-uploaded URLs.
--
-- IT IS WRITTEN `IF NOT EXISTS` THROUGHOUT, ON PURPOSE. The table already
-- exists in production with rows in it. This migration must be a NO-OP there
-- and a full creation everywhere else. It therefore adds nothing, drops
-- nothing and alters no column: running it against the live database changes
-- not one byte, while running it against an empty one produces the table the
-- code has always assumed.
--
-- VERIFY BEFORE TRUSTING THIS AS THE SCHEMA OF RECORD. The columns below are
-- reconstructed from the only code that touches the table — the upsert in
-- lib/finishes/media.ts writes exactly vertical, kind, media_key, src, alt,
-- caption and sort_order, and conflicts on (vertical, kind, media_key). That
-- fixes the column NAMES and the unique constraint with certainty. It does NOT
-- prove the live column TYPES, the nullability, or whether RLS is currently on.
-- Confirm against production before treating this file as authoritative:
--
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'finish_media'
--    order by ordinal_position;
--
--   select relrowsecurity from pg_class where relname = 'finish_media';
--
-- If production disagrees with anything here, production is the truth and this
-- file is the thing to correct — never the other way round.
-- ============================================================================

create table if not exists public.finish_media (
  id uuid primary key default gen_random_uuid(),

  -- Which trade's catalogue this belongs to. 'epoxy' is the only value in use;
  -- text rather than an enum because a second vertical should be a row, not a
  -- migration.
  vertical text not null,

  -- 'swatch' (one option, close-cropped) or 'combination' (a whole floor).
  -- Constrained rather than free text: lib/finishes/media-types.ts declares
  -- exactly these two, and a third value would silently never be read.
  kind text not null,

  -- 'flake_blend:domino' for a swatch, or a comboKeyFor() string for a
  -- combination. Part of the identity of the row, not a label.
  media_key text not null,

  -- A path under /public or an absolute https:// URL. Storage holds the file;
  -- this holds its address.
  src text not null,

  alt text not null default '',
  caption text not null default '',
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),

  -- THE UPSERT DEPENDS ON THIS EXACT TUPLE. saveFinishMedia passes
  -- `onConflict: 'vertical,kind,media_key'`, which requires a matching unique
  -- constraint — without it the upsert does not update, it inserts a duplicate,
  -- and the picker starts choosing between two rows for the same combination
  -- with no rule about which wins. Kind is in the key because a swatch and a
  -- combination could in principle carry the same string.
  constraint finish_media_kind_check check (kind in ('swatch', 'combination')),
  constraint finish_media_unique unique (vertical, kind, media_key)
);

create index if not exists finish_media_vertical_kind_idx
  on public.finish_media (vertical, kind);

comment on table public.finish_media is
  'Operator-supplied pictures for the finish picker: one row per swatch or per combination, addressed by (vertical, kind, media_key).';

-- ----------------------------------------------------------------------------
-- RLS
--
-- READ IS PUBLIC AND THAT IS THE INTENT. These are marketing photographs shown
-- to every anonymous visitor who opens the picker; there is nothing here that
-- is not already on a public page. `finishMediaFor` is called from a server
-- component with the service-role client and would bypass RLS regardless, but
-- the policy is declared so the posture is stated rather than assumed.
--
-- WRITES ARE NOT GRANTED TO anon OR authenticated. Every write goes through
-- app/actions/finishMedia.ts, which checks `requireAdmin()` first and then uses
-- the service-role client. Service role bypasses RLS, so no write policy is
-- needed — and adding one would create a second, weaker path to the same table
-- that the admin check does not guard.
--
-- IF PRODUCTION CURRENTLY HAS RLS DISABLED on this table, enabling it here
-- changes nothing for the app (service role is unaffected) but does close
-- direct anon writes through the REST API. Confirm with the pg_class query
-- above before assuming this file matches what is live.
-- ----------------------------------------------------------------------------

alter table public.finish_media enable row level security;

drop policy if exists finish_media_public_read on public.finish_media;
create policy finish_media_public_read
  on public.finish_media
  for select
  to anon, authenticated
  using (true);
