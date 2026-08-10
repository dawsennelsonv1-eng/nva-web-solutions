import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * lib/storage/toolMedia.ts — putting a recording into the tool-media bucket.
 *
 * ============================================================================
 * SIGNED UPLOAD URL, NOT A SERVER ACTION THAT CARRIES THE FILE
 * ============================================================================
 *
 * The obvious shape is: browser reads the file to base64, hands it to a server
 * action, action uploads it. lib/storage/photos.ts does exactly that and is
 * right to, because those files are already in memory on the server for the
 * vision call.
 *
 * It is the wrong shape here for a hard reason. NEXT.JS CAPS A SERVER ACTION
 * BODY AT 1 MB by default, and base64 inflates a file by a third — so the
 * largest recording that could ever arrive is about 750 KB, against a bucket
 * ceiling of 8 MB. The operator would upload a perfectly ordinary eight-second
 * animation and get an opaque failure with nothing in it naming the size.
 *
 * So the server mints a one-shot upload URL and the browser PUTs the file
 * straight to Storage. The action body carries a filename and a content type;
 * the bytes never pass through the Next process at all. The 1 MB limit stops
 * being a constraint instead of being raised, which is better — raising it
 * would have applied to every action in the app.
 *
 * THE TOKEN IS NOT A SECRET WORTH GUARDING. It is single-use, scoped to one
 * path in one bucket, and only issued to a caller who has already passed
 * requireAdmin(). Nothing else in the bucket is reachable with it.
 *
 * ============================================================================
 * PATH SHAPE
 * ============================================================================
 *
 *   <toolId>/<timestamp>-<random>.<ext>
 *
 * Grouped by tool so the bucket stays legible in the Supabase UI, and
 * timestamped so a re-upload of the same source file never collides with the
 * old one. Deliberately NOT named after the original file: an operator's
 * camera roll filename can contain spaces, quotes and unicode that Storage
 * paths handle badly, and it tells us nothing.
 *
 * upsert stays FALSE. A collision here would mean two different recordings
 * fighting over one URL, and the random suffix makes a collision effectively
 * impossible anyway — so if one ever happens, failing loudly is correct.
 */

const BUCKET = 'tool-media';

/**
 * What the bucket accepts, mapped to the extension the path gets. Kept in step
 * with allowed_mime_types in 0021_tool_media_bucket.sql — a type accepted here
 * and rejected there produces a signed URL that fails on upload with no useful
 * message, so these two lists must not drift.
 */
const EXT_BY_TYPE: Record<string, string> = {
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'video/mp4': 'mp4',
};

export function toolMediaExtFor(contentType: string): string | null {
  return EXT_BY_TYPE[contentType] ?? null;
}

export interface SignedToolMediaUpload {
  /** Path inside the bucket. Needed by uploadToSignedUrl on the browser. */
  path: string;
  /** One-shot token. Pair it with the path. */
  token: string;
  /** Where the file will be readable once the upload lands. */
  publicUrl: string;
}

/**
 * Mints an upload URL. Returns null on any failure rather than throwing — the
 * caller is a server action whose job is to return a message the operator can
 * act on, and an exception would surface as an unhandled server error with no
 * such message.
 *
 * The most likely cause of null in practice is migration 0021 not having been
 * run, so the bucket does not exist. The action's copy says so.
 */
export async function createToolMediaUpload(
  toolId: string,
  contentType: string
): Promise<SignedToolMediaUpload | null> {
  try {
    const ext = toolMediaExtFor(contentType);
    if (!ext) return null;

    const safeTool = toolId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
    if (safeTool.length === 0) return null;

    const suffix = Math.random().toString(36).slice(2, 10);
    const path = safeTool + '/' + Date.now() + '-' + suffix + '.' + ext;

    const db = getSupabaseAdminClient();
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return null;

    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);
    if (!pub?.publicUrl) return null;

    return { path, token: data.token, publicUrl: pub.publicUrl };
  } catch {
    return null;
  }
}
