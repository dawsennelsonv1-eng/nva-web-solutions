-- 0022_finish_media.sql — the pictures behind the customisation picker.
--
-- ============================================================================
-- TWO KINDS OF PICTURE, ONE TABLE
-- ============================================================================
--
-- SWATCH — one option, on its own. The little rectangle a visitor taps, showing
-- what "Copper burl" or "Domino" actually looks like. Keyed by group:option,
-- e.g. 'flake_blend:domino'.
--
-- COMBINATION — a whole set of choices photographed on one reference garage.
-- This is the big picture ABOVE the swatches, and it is the thing that sells:
-- a homeowner cannot assemble "metallic, copper burl, high gloss" in his head
-- from three small rectangles, but he understands one photograph instantly.
-- Keyed by the canonical string from comboKeyFor() in
-- lib/verticals/epoxy/options.ts.
--
-- One table because they differ only in what the key means, and two tables
-- would mean two admin screens, two policies and two upload paths for what is
-- the same operation: put a picture somewhere and label it.
--
-- ============================================================================
-- THIS IS THE HONEST PLACEHOLDER PROBLEM, SOLVED BY ABSENCE
-- ============================================================================
--
-- Most combinations will have no photograph, and that is expected — the
-- catalogue permits hundreds and no operator will shoot them all. There is NO
-- generated stand-in and no "similar" fallback: showing a homeowner a picture
-- of a different floor labelled as his choice is exactly the fabrication this
-- codebase refuses everywhere else.
--
-- A missing combination photo renders as the option's own swatches and a plain
-- line saying no reference photo exists for this exact mix yet. That is the
-- empty state, and it is correct until somebody uploads one.
--
-- ============================================================================
-- STORAGE
-- ============================================================================
--
-- Files live in the tool-media bucket from 0021: already public-read,
-- already admin-write, already wired to a signed-upload path that bypasses the
-- 1 MB server-action body limit. A second bucket would duplicate all of that
-- to hold the same class of object — a picture shown to anonymous visitors on
-- a marketing surface.
--
-- IDEMPOTENT. Safe to run twice.

create table if not exists public.finish_media (
  id          uuid primary key default gen_random_uuid(),
  -- 'swatch' or 'combination'. A check rather than an enum: enums need a
  -- migration to extend and this list is likely to gain 'texture' or 'room'
  -- before it gains anything else.
  kind        text not null check (kind in ('swatch', 'combination')),
  -- The vertical this belongs to. Present from the start because painting will
  -- have its own catalogue and its own pictures, and retrofitting a scope
  -- column onto a populated table is the migration nobody enjoys.
  vertical    text not null default 'epoxy',
  -- 'flake_blend:domino' for a swatch, or the comboKeyFor() string for a
  -- combination. Long, because a full combination key runs to eight segments.
  media_key   text not null check (char_length(media_key) between 1 and 400),
  src         text not null check (char_length(src) between 1 and 600),
  alt         text not null default '' check (char_length(alt) <= 300),
  caption     text not null default '' check (char_length(caption) <= 300),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One picture per key per vertical. The upsert path depends on this: an
-- operator re-uploading a swatch replaces it rather than stacking a second row
-- that wins or loses by sort order depending on the day.
create unique index if not exists finish_media_key_idx
  on public.finish_media (vertical, kind, media_key);

drop trigger if exists finish_media_updated_at on public.finish_media;
create trigger finish_media_updated_at before update on public.finish_media
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- policies
-- ---------------------------------------------------------------------------

alter table public.finish_media enable row level security;

drop policy if exists finish_media_public_read on public.finish_media;
drop policy if exists finish_media_admin_write on public.finish_media;

-- Anonymous read. These render on a public marketing page to visitors who have
-- given nothing and are owed a working page.
create policy finish_media_public_read
  on public.finish_media for select
  using (true);

-- Everything that writes is the operator. `for all` with both clauses covers
-- insert, update and delete in one policy, which is right here because the
-- answer is identical for all three.
create policy finish_media_admin_write
  on public.finish_media for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
--
--   select kind, count(*) from public.finish_media group by kind;
--
-- Expect zero rows on a fresh run. Upload from /admin/finishes.
