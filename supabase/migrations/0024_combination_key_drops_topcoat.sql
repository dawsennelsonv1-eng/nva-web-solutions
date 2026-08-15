-- ============================================================================
-- 0024_combination_key_drops_topcoat.sql — RE-FILE THE PICTURES PHASE 46
-- ORPHANED (Phase 51)
--
-- WHAT HAPPENED. Phase 46 removed `topcoat` from APPEARANCE_GROUPS, so
-- `comboKeyFor` stopped emitting a topcoat segment. That fixed a real problem —
-- the operator generates gloss only, so any visitor who moved the sheen asked
-- for a picture that had never been rendered and watched the preview vanish.
--
-- WHAT IT MISSED. Every combination already in `finish_media` was filed under
-- the OLD format:
--
--     system=solid&solid_colour=slate&topcoat=gloss     <- stored
--     system=solid&solid_colour=slate                   <- now asked for
--
-- Those do not match. Nothing was deleted and nothing failed; the rows are all
-- still there, addressed by a string the application no longer constructs. The
-- symptom is the entire combination library appearing empty at once, which
-- looks exactly like the pictures having been destroyed. The code change was
-- right and shipping it without this migration was not.
--
-- WHY A MIGRATION RATHER THAN REGENERATING. Regenerating means paying the
-- image model again for pictures that already exist and are already correct.
-- The bytes in Storage are fine. Only the address is stale.
--
-- ============================================================================
-- THE DELETE COMES FIRST, AND IT IS NOT OPTIONAL
-- ============================================================================
--
-- `finish_media_key_idx` is UNIQUE on (vertical, kind, media_key). If the
-- operator ever generated two sheens of one combination, both rows collapse to
-- the same key once the topcoat segment is stripped, and the UPDATE aborts on
-- a duplicate key — taking the whole migration with it and leaving every
-- combination still orphaned.
--
-- So collisions are resolved BEFORE the rewrite, keeping exactly one row per
-- destination key:
--
--   1. Prefer the GLOSS row. It is what ComboStudio generates by default, so
--      it is the one the library was actually built from and the one most
--      likely to have been reviewed.
--   2. Failing that, prefer the OLDEST. It is the one that has been on the
--      site longest and is least likely to be a half-finished retry.
--
-- The losing rows are deleted from this table only. Their files stay in the
-- `tool-media` bucket — this migration will not reach into Storage, and an
-- orphaned object there costs a few kilobytes and no correctness. The 90-day
-- retention job is the right place for that, not a schema migration.
--
-- SWATCHES ARE UNTOUCHED. `swatchKeyFor` never included a topcoat and its keys
-- look like `flake_blend:domino`. Every statement below is restricted to
-- `kind = 'combination'`.
--
-- IT IS SAFE TO RUN TWICE. The second run matches nothing: the WHERE clause
-- requires a `topcoat=` segment, and after the first run none remain.
--
-- VERIFY AFTERWARDS. This should return zero rows:
--
--   select media_key from public.finish_media
--    where kind = 'combination' and media_key like '%topcoat=%';
--
-- And this should list your combinations under their new addresses:
--
--   select media_key, src from public.finish_media
--    where kind = 'combination' order by media_key;
-- ============================================================================

begin;

-- 1. Resolve collisions before they can abort the rewrite.
with ranked as (
  select
    id,
    row_number() over (
      partition by
        vertical,
        kind,
        regexp_replace(media_key, '&topcoat=[^&]*', '')
      order by
        (media_key like '%topcoat=gloss%') desc,
        created_at asc,
        id asc
    ) as rn
  from public.finish_media
  where kind = 'combination'
)
delete from public.finish_media f
using ranked r
where f.id = r.id
  and r.rn > 1;

-- 2. Re-file the survivors under the key the application now builds.
--
-- `comboKeyFor` joins segments with '&' and emits topcoat last, so the segment
-- is always preceded by '&' and never leads the string. The pattern is
-- anchored on that '&' precisely so a key that somehow began with topcoat
-- would be left alone rather than silently mangled into one starting with '&'.
update public.finish_media
   set media_key = regexp_replace(media_key, '&topcoat=[^&]*', '')
 where kind = 'combination'
   and media_key like '%&topcoat=%';

commit;
