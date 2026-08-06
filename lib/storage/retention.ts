import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * lib/storage/retention.ts — THE 90-DAY DELETION DATA_MODEL.md PROMISED.
 *
 * DATA_MODEL.md §19 sets a 90-day retention window on floor photos. Nothing
 * deleted anything. lib/storage/photos.ts said so plainly — "deferred
 * explicitly, flagged in VERIFY, because building a cron for it now would be
 * ahead of having any photos to delete" — which was true then and stopped
 * being true twice over: the visualiser now writes a SECOND image per session,
 * and a retention promise in a document is a commitment the moment a privacy
 * page repeats it.
 *
 * ============================================================================
 * IT DELETES FROM STORAGE ONLY. IT NEVER TOUCHES A ROW.
 * ============================================================================
 *
 * quotes.photo_path and leads.render_path keep pointing at paths that no
 * longer resolve, and that is the correct outcome rather than an oversight.
 *
 * A lead is a business record. Nulling its columns to tidy up after the image
 * would quietly rewrite history — a contractor looking at a six-month-old lead
 * would see one that never had a photo, rather than one whose photo has aged
 * out. Those are different facts. getSignedPhotoUrl already returns null for a
 * missing object, and every surface that displays a photo already handles null,
 * so a dangling path degrades to "no image" at exactly the places it should.
 *
 * ============================================================================
 * PATH SHAPE IS THE CLOCK, NOT created_at
 * ============================================================================
 *
 * photos.ts writes {prototypeId|'demo'}/{sessionId}/{timestamp}.{ext}. Supabase
 * Storage's list() returns created_at metadata, but it is per-object and
 * paginated, and walking every prefix to read it would mean thousands of calls
 * to answer a question the filename already answers.
 *
 * So the millisecond timestamp in the name IS the age. It is written by us, it
 * is unambiguous, and it cannot disagree with the object it names. A file whose
 * name does not parse as a timestamp is SKIPPED rather than deleted — an
 * unrecognised name is a thing this function does not understand, and deleting
 * things you do not understand is how a retention job becomes a data loss
 * incident.
 *
 * ============================================================================
 * BOUNDED, AND SAFE TO RUN TWICE
 * ============================================================================
 *
 * Deleting an already-deleted object is not an error in Supabase Storage, so a
 * retried or manually-triggered run is harmless — the same idempotence
 * property the dunning pass relies on.
 *
 * MAX_DELETIONS caps one pass. A cron route has 60 seconds; an unbounded first
 * run against a year of backlog would time out halfway through with no record
 * of where it stopped. Capped, it deletes the oldest it finds, returns a count,
 * and the next night takes the next batch. Slower to drain, impossible to
 * half-finish.
 */

const BUCKET = 'floor-photos';

/** DATA_MODEL.md §19. Changing this changes a published commitment. */
export const RETENTION_DAYS = 90;

/** One pass's ceiling. See the note above before raising it. */
const MAX_DELETIONS = 500;

/** Storage list() pages; this is the page size, not a total. */
const PAGE = 100;

export interface RetentionResult {
  scanned: number;
  deleted: number;
  skippedUnparseable: number;
  /** True when the cap was hit and more remain for the next pass. */
  moreRemaining: boolean;
}

/** `1730928000000.webp` -> 1730928000000. Null when the name is not ours. */
function timestampFromName(name: string): number | null {
  const base = name.split('.')[0];
  if (!base || !/^\d{10,16}$/.test(base)) return null;
  const n = Number(base);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function runRetentionPass(): Promise<RetentionResult> {
  const db = getSupabaseAdminClient();
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  let scanned = 0;
  let deleted = 0;
  let skippedUnparseable = 0;
  let moreRemaining = false;
  const doomed: string[] = [];

  // Level 1: prototype scopes (and 'demo').
  const { data: scopes, error: scopeError } = await db.storage
    .from(BUCKET)
    .list('', { limit: PAGE });
  if (scopeError || !scopes) {
    return { scanned: 0, deleted: 0, skippedUnparseable: 0, moreRemaining: false };
  }

  outer: for (const scope of scopes) {
    // Level 2: session folders.
    const { data: sessions } = await db.storage
      .from(BUCKET)
      .list(scope.name, { limit: PAGE });
    if (!sessions) continue;

    for (const session of sessions) {
      const prefix = scope.name + '/' + session.name;
      // Level 3: the objects themselves.
      const { data: files } = await db.storage.from(BUCKET).list(prefix, { limit: PAGE });
      if (!files) continue;

      for (const file of files) {
        scanned++;
        const ts = timestampFromName(file.name);
        if (ts === null) {
          // Not a name this system wrote. Left alone, deliberately.
          skippedUnparseable++;
          continue;
        }
        if (ts >= cutoff) continue;

        doomed.push(prefix + '/' + file.name);
        if (doomed.length >= MAX_DELETIONS) {
          moreRemaining = true;
          break outer;
        }
      }
    }
  }

  if (doomed.length > 0) {
    // One call, not one per object: remove() takes an array, and a per-file
    // loop over 500 paths would spend the whole cron budget on round trips.
    const { error } = await db.storage.from(BUCKET).remove(doomed);
    if (!error) deleted = doomed.length;
  }

  return { scanned, deleted, skippedUnparseable, moreRemaining };
}
