-- ============================================================================
-- 0019_tool_media.sql — THE RECORDINGS SHOWN ON A TOOL (Phase 16E)
--
-- Replaces the hardcoded manifest in lib/tools/media.ts, which required a code
-- change and a deploy to add a single GIF. These rows are edited at
-- /admin/media and are live on the next request.
--
-- ============================================================================
-- src IS A URL OR A PATH, AND THAT IS DELIBERATE
-- ============================================================================
--
-- No file upload, no storage bucket, no signed URLs. `src` is text: either a
-- path under /public ('/tools/epoxy/01.gif') or any absolute https URL.
--
-- The reason is who is using this. The operator works from a phone. Getting a
-- screen recording into /public means committing a binary through Termux;
-- pasting a link to a file he has already hosted takes five seconds. Building
-- an upload pipeline would be the more impressive answer and the less usable
-- one, and it can be added later without changing this column.
--
-- ============================================================================
-- POSITION IS THE ORDER, AND IT IS UNIQUE PER TOOL
-- ============================================================================
--
-- The composite primary key makes two slots in the same position impossible,
-- which is what stops a gallery whose order changes between requests because
-- two rows sorted arbitrarily. The editor rewrites positions 0..n-1 on every
-- save, so there are never gaps.
--
-- MIN 3 / MAX 10 ARE NOT ENFORCED HERE. The maximum is a check constraint
-- because ten is a hard limit — every frame is mounted at once by the gallery
-- and an unbounded list is an unbounded page weight. The minimum is NOT a
-- constraint, because it is a DISPLAY rule: below three filled slots the
-- gallery renders nothing at all. Enforcing it in the database would make it
-- impossible to save a tool halfway through adding its recordings, which is
-- exactly what the operator is doing while he uses this screen.
-- ============================================================================

create table public.tool_media (
  tool_id text not null check (char_length(tool_id) between 1 and 60),
  position smallint not null check (position >= 0 and position < 10),

  kind text not null check (kind in ('animation', 'still')),
  src text not null check (char_length(src) between 3 and 500),

  -- Required, and required for a reason: this is the only description of the
  -- frame a screen reader ever gets, and a gallery of unlabelled screen
  -- recordings is unusable without it.
  alt text not null check (char_length(alt) between 3 and 300),
  caption text not null check (char_length(caption) between 1 and 120),

  -- How long the slide holds. The browser gives no event when an animated GIF
  -- finishes a loop and no way to read its length, so the person adding the
  -- file types in how long it runs. See lib/tools/media.ts.
  duration_ms integer not null default 3000 check (duration_ms between 800 and 30000),

  updated_at timestamptz not null default now(),

  primary key (tool_id, position)
);

-- ----------------------------------------------------------------------------
-- RLS — public read, admin write.
--
-- Read is public because these frames ARE the public page; there is nothing to
-- protect. Write is admin only, so a visitor cannot put an arbitrary image URL
-- onto the homepage of every contractor looking at this site.
-- ----------------------------------------------------------------------------

alter table public.tool_media enable row level security;

create policy tool_media_public_read
  on public.tool_media
  for select
  to anon, authenticated
  using (true);

create policy tool_media_admin_write
  on public.tool_media
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- SEED — the five epoxy mockups that were hardcoded in lib/tools/media.ts.
--
-- Seeded rather than dropped so the site looks identical the moment this runs.
-- THE FILES THESE POINT AT DO NOT EXIST YET; the gallery renders a labelled
-- "Recording" placeholder for each until they do, which is the same behaviour
-- as before this migration. Replace the `src` values from /admin/media as real
-- recordings are made.
-- ----------------------------------------------------------------------------

insert into public.tool_media (tool_id, position, kind, src, alt, caption, duration_ms) values
  ('epoxy', 0, 'animation', '/tools/epoxy/01-visualiser.gif',
   'A photo of a bare garage floor turning into the same floor with a metallic coating on it',
   'Their own garage, finished', 6000),
  ('epoxy', 1, 'animation', '/tools/epoxy/02-quote.gif',
   'Somebody dragging the area control and a price range moving with it',
   'A real range in under a minute', 5000),
  ('epoxy', 2, 'animation', '/tools/epoxy/03-lead.gif',
   'A completed enquiry arriving with name, phone, job size and photo',
   'The lead lands either way', 4000),
  ('epoxy', 3, 'still', '/tools/epoxy/04-rates.webp',
   'The rate table in the dashboard, with every figure editable',
   'Every number is yours to set', 3000),
  ('epoxy', 4, 'still', '/tools/epoxy/05-mobile.webp',
   'The quoting widget on a phone, one-handed, in daylight',
   'Built for the phone first', 3000);
