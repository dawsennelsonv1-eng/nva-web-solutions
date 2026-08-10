-- 0021_tool_media_bucket.sql — a PUBLIC bucket for the recordings and pictures
-- shown on tool pages and homepage cards.
--
-- ============================================================================
-- WHY A SECOND BUCKET RATHER THAN REUSING floor-photos
-- ============================================================================
--
-- floor-photos (0004_storage.sql) is PRIVATE and must stay private: it holds
-- photographs of members of the public's homes, it has no anon policies in
-- either direction, and the only legitimate read path is a short-lived signed
-- URL from lib/storage/photos.ts.
--
-- Tool media is the exact opposite in every respect. It is marketing material,
-- it renders in an <img> on a page served to anonymous visitors, and a signed
-- URL would expire while a page sat open in a tab. Making floor-photos public
-- to serve it would expose every homeowner's garage.
--
-- Two buckets, two postures, no shared blast radius.
--
-- ============================================================================
-- PUBLIC READ, ADMIN WRITE
-- ============================================================================
--
-- `public = true` makes objects readable at
--   /storage/v1/object/public/tool-media/<path>
-- with no token, which is what an <img> on a marketing page needs.
--
-- It does NOT make them writable. Insert, update and delete below are gated on
-- public.is_admin(), the same function middleware and requireAdmin() use, so
-- the only person who can put a picture on the front of the site is the
-- operator. That was the whole point of closing saveToolMediaAction in 16F,
-- and an open bucket would have reopened it from the other side.
--
-- ============================================================================
-- THE SIZE CEILING IS 8 MB AND THAT IS DELIBERATELY GENEROUS
-- ============================================================================
--
-- floor-photos is capped at 512 KB because those files are resized in the
-- browser before upload and then sent to a vision model.
--
-- These are screen recordings. An eight-second animated WebP of a widget in
-- use does not fit in 512 KB at a quality worth showing, and the whole purpose
-- of the gallery is that the motion is what stops a scroll. 8 MB is high
-- enough that the operator never has to think about it and low enough that a
-- misdropped video file is refused by the bucket rather than by a timeout.
--
-- IDEMPOTENT, like every migration from 0005 on: safe to run twice.

-- ---------------------------------------------------------------------------
-- the bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tool-media',
  'tool-media',
  true,
  8388608,
  array[
    'image/gif',
    'image/webp',
    'image/png',
    'image/jpeg',
    'video/mp4'
  ]
)
on conflict (id) do update set
  public            = excluded.public,
  file_size_limit   = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- policies
-- ---------------------------------------------------------------------------
--
-- Dropped first so re-running this file replaces them rather than failing on a
-- duplicate name. `if exists` keeps the first run clean.

drop policy if exists tool_media_public_read on storage.objects;
drop policy if exists tool_media_admin_insert on storage.objects;
drop policy if exists tool_media_admin_update on storage.objects;
drop policy if exists tool_media_admin_delete on storage.objects;

-- Anyone, signed in or not. This is marketing material on a public page.
create policy tool_media_public_read
  on storage.objects for select
  using (bucket_id = 'tool-media');

-- Everything that WRITES is the operator only.
create policy tool_media_admin_insert
  on storage.objects for insert
  with check (bucket_id = 'tool-media' and public.is_admin());

create policy tool_media_admin_update
  on storage.objects for update
  using (bucket_id = 'tool-media' and public.is_admin())
  with check (bucket_id = 'tool-media' and public.is_admin());

create policy tool_media_admin_delete
  on storage.objects for delete
  using (bucket_id = 'tool-media' and public.is_admin());

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
--
-- After running, confirm the bucket exists and is public:
--
--   select id, public, file_size_limit from storage.buckets where id = 'tool-media';
--
-- Expect one row, public = true, file_size_limit = 8388608.
--
-- Uploads from the admin screen go through a SIGNED UPLOAD URL minted
-- server-side (app/actions/toolMedia.ts), so the browser never holds the
-- service-role key and the 1 MB Next.js server-action body limit never applies
-- to the file itself — only to the few hundred bytes of the request for a URL.
