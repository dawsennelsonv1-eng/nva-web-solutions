import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * lib/storage/photos.ts — THE PHOTO STORAGE RETROFIT (Phase 6).
 *
 * A real gap, disclosed plainly: since Phase 3, every floor photo has been
 * sent straight to Anthropic for analysis and then discarded — nothing ever
 * wrote it to the `floor-photos` bucket Phase 2 built for exactly this
 * purpose. That was invisible until now because nothing needed to look at a
 * photo again. It stopped being invisible the moment this phase's leads
 * inbox needed to show one: "detail drawer with... uploaded photo" cannot
 * be built against a column nothing has ever populated.
 *
 * The fix is upload-on-analysis: the same call that already has the decoded
 * bytes in memory (lib/quote/vision.ts's caller) uploads them to Storage
 * right there, so no second network trip and no second place that could
 * silently stop happening. The returned STORAGE PATH then rides through the
 * widget machine alongside the vision hints it already carries, to be
 * attached to the quote row when one is persisted — see the analyze/
 * persistQuote port changes in this same delivery.
 *
 * PATH SHAPE: {prototypeId | 'demo'}/{sessionId}/{timestamp}.{ext} — scoped
 * so a real contractor's photos and the public demo's photos can never
 * collide, and ordered so `list()` on a prototype's prefix is chronological
 * by construction, with no separate index to maintain.
 *
 * RETENTION: DATA_MODEL.md §19 sets 90 days. Deletion is a scheduled job,
 * not built in this phase — deferred explicitly, flagged in VERIFY, because
 * building a cron for it now would be ahead of having any photos to delete.
 */

const BUCKET = 'floor-photos';
const EXT_BY_TYPE: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export interface UploadFloorPhotoArgs {
  prototypeId: string | null;
  sessionId: string;
  base64: string;
  mediaType: string;
}

/**
 * Uploads a decoded photo. Never throws — a storage failure must not break
 * the analysis or the quote that follows; it degrades to no photo on the
 * eventual quote row, which the leads inbox already renders cleanly.
 */
export async function uploadFloorPhoto(args: UploadFloorPhotoArgs): Promise<string | null> {
  try {
    const ext = EXT_BY_TYPE[args.mediaType];
    if (!ext) return null;

    const bytes = Buffer.from(args.base64, 'base64');
    // Bucket ceiling is 512 KB (0004_storage.sql); guards.ts already enforces
    // this before the vision call, but a defensive re-check here means this
    // function is safe to call from anywhere, not just after that guard.
    if (bytes.length === 0 || bytes.length > 524_288) return null;

    const scope = args.prototypeId ?? 'demo';
    const path = scope + '/' + args.sessionId + '/' + Date.now() + '.' + ext;

    const db = getSupabaseAdminClient();
    const { error } = await db.storage.from(BUCKET).upload(path, bytes, {
      contentType: args.mediaType,
      upsert: false,
    });
    if (error) return null;

    return path;
  } catch {
    return null;
  }
}

/**
 * A time-limited signed URL for the admin leads drawer. floor-photos has NO
 * anon policies in either direction (0004_storage.sql) — this is the only
 * legitimate way to view one, and it expires so a copied link doesn't stay
 * live in someone's browser history indefinitely.
 */
export async function getSignedPhotoUrl(path: string, expiresInSeconds = 300): Promise<string | null> {
  try {
    const db = getSupabaseAdminClient();
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
