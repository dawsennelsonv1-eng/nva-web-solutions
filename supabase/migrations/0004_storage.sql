-- ============================================================================
-- 0004_storage.sql — STORAGE BUCKETS + POLICIES (Phase 2)
--
-- Two buckets. Size and MIME limits are enforced AT BUCKET LEVEL (columns on
-- storage.buckets), as the phase spec requires — app-code validation is a
-- courtesy on top, never the enforcement.
--
--   logos         PUBLIC bucket. Contractor logos render on public branded
--                 pages, so objects are world-readable by public URL.
--                 Written only by the admin path (service role).
--                 Limit: 2 MB · png/jpeg/webp/svg.
--
--   floor-photos  PRIVATE bucket. A homeowner's photo of their own property
--                 is a liability (DATA_MODEL.md §19): 90-day retention,
--                 admin-only viewing via signed URLs, no anonymous access in
--                 either direction. The Phase 4 client pipeline hard-caps
--                 uploads at 400 KB; the bucket ceiling is 512 KB so nothing
--                 oversized can land even if app code regresses.
--                 Written only by the server (service role) after the vision
--                 call path receives the compressed image.
--
-- FILE_TREE.md note: this file is a Phase 2 addition (migrations 0001–0003
-- were listed; storage config merits its own migration). Update project
-- knowledge alongside the Phase 1 additions.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('logos', 'logos', true, 2097152,
   array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('floor-photos', 'floor-photos', false, 524288,
   array['image/jpeg','image/webp','image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- storage.objects policies
-- (RLS is already enabled on storage.objects by Supabase.)
-- ----------------------------------------------------------------------------

-- Admin: full object access in both buckets (list, read, write, delete)
-- through the same is_admin() identity as the data tables.
create policy nva_admin_all_objects on storage.objects
  for all to authenticated
  using (bucket_id in ('logos','floor-photos') and public.is_admin())
  with check (bucket_id in ('logos','floor-photos') and public.is_admin());

-- Logos are world-readable through the storage API as well as the public
-- URL (the public URL path does not consult policies; this covers API reads).
create policy nva_public_read_logos on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'logos');

-- floor-photos: NO anon policies of any kind, deliberately. Uploads and
-- reads happen exclusively through the service role (which bypasses RLS)
-- and admin-generated signed URLs. Absence of a policy IS the rule here.

-- NOTE FOR THE SUPABASE SQL EDITOR: on some projects, creating policies on
-- storage.objects from SQL fails with "must be owner of table objects"
-- (ownership sits with the storage system role). If you hit that error, the
-- bucket INSERT above still succeeds — recreate ONLY the two policies via
-- Dashboard → Storage → Policies with exactly the definitions above
-- (admin: ALL on both buckets, expression `public.is_admin()`;
--  logos: SELECT for anon+authenticated, expression `bucket_id = 'logos'`).
