import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * lib/storage/logos.ts — logo upload to the `logos` bucket (0004_storage.sql).
 *
 * Deliberately separate from lib/storage/photos.ts despite the similar
 * shape, because the two buckets have opposite security postures and
 * merging them would invite applying the wrong one:
 *   logos        PUBLIC bucket, 2MB, png/jpeg/webp/svg — rendered on public
 *                branded pages, so a plain public URL is correct.
 *   floor-photos PRIVATE bucket, 512KB, no anon access, signed URLs only —
 *                a homeowner's property photo is a liability.
 *
 * PER-PROTOTYPE PATH: {prototypeId}/{timestamp}.{ext}. Re-uploading a logo
 * writes a new object rather than overwriting, so a brand kit that pointed
 * at the old path keeps rendering while the new one is being reviewed.
 */

const BUCKET = 'logos';
const MAX_BYTES = 2_097_152; // matches the bucket ceiling in 0004_storage.sql

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export interface UploadLogoResult {
  ok: boolean;
  path?: string;
  publicUrl?: string;
  error?: string;
}

export async function uploadLogo(args: {
  prototypeId: string;
  base64: string;
  mediaType: string;
}): Promise<UploadLogoResult> {
  const ext = EXT_BY_TYPE[args.mediaType];
  if (!ext) return { ok: false, error: 'That file type is not supported. Use PNG, JPEG, WebP or SVG.' };

  let bytes: Buffer;
  try {
    bytes = Buffer.from(args.base64, 'base64');
  } catch {
    return { ok: false, error: 'That logo could not be read.' };
  }

  if (bytes.length === 0) return { ok: false, error: 'That logo file was empty.' };
  if (bytes.length > MAX_BYTES) return { ok: false, error: 'That logo is too large. Keep it under 2MB.' };

  try {
    const path = args.prototypeId + '/' + Date.now() + '.' + ext;
    const db = getSupabaseAdminClient();
    const { error } = await db.storage.from(BUCKET).upload(path, bytes, {
      contentType: args.mediaType,
      upsert: false,
    });
    if (error) return { ok: false, error: 'Could not save that logo. Try again.' };

    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    return { ok: true, path, publicUrl: data.publicUrl };
  } catch {
    return { ok: false, error: 'Could not save that logo. Try again.' };
  }
}

export function getLogoPublicUrl(path: string): string | null {
  try {
    const db = getSupabaseAdminClient();
    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return null;
  }
}
