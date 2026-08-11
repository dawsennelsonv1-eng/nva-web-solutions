'use server';

import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin';
import { saveFinishMedia, deleteFinishMedia } from '@/lib/finishes/media';
import { createToolMediaUpload, toolMediaExtFor } from '@/lib/storage/toolMedia';

/**
 * app/actions/finishMedia.ts — putting pictures behind the customisation
 * picker.
 *
 * ============================================================================
 * IT REUSES THE tool-media BUCKET, ON PURPOSE
 * ============================================================================
 *
 * 0021 already created a public-read, admin-write bucket with a signed-upload
 * path that sidesteps the 1 MB server-action body limit. Swatches and
 * combination photographs are exactly the same class of object: pictures shown
 * to anonymous visitors on a marketing surface, uploaded only by the operator.
 *
 * A second bucket would duplicate the policies, the size ceiling and the
 * upload path, and would give two places to look when a picture does not
 * appear. The paths are namespaced by the toolId argument, so they stay
 * legible in the Supabase console.
 *
 * ============================================================================
 * EVERY EXPORT IS ADMIN-ONLY, CHECKED FIRST
 * ============================================================================
 *
 * requireAdmin() before parsing, in every function. Parsing first would mean
 * an anonymous caller could learn the shape of the schema from the difference
 * between "invalid" and "not allowed" — small, but free to avoid.
 */

const kindSchema = z.enum(['swatch', 'combination']);

const saveSchema = z.object({
  vertical: z.string().trim().min(1).max(40),
  kind: kindSchema,
  mediaKey: z.string().trim().min(1).max(400),
  // Accepts a /public path or an https:// URL, matching the column's own
  // constraint. A Supabase public URL is the latter.
  src: z.string().trim().min(1).max(600),
  alt: z.string().trim().max(300),
  caption: z.string().trim().max(300),
  sortOrder: z.number().int().min(0).max(999),
});

export type FinishMediaResult = { ok: true } | { ok: false; message: string };

export async function saveFinishMediaAction(raw: unknown): Promise<FinishMediaResult> {
  if (!(await requireAdmin())) {
    return { ok: false, message: 'Not signed in as an admin. Sign in again and retry.' };
  }

  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: 'That did not save — check the address and the labels.' };
  }

  const ok = await saveFinishMedia(parsed.data);
  if (!ok) {
    return {
      ok: false,
      message:
        'Could not write that. If migration 0022 has not been run yet, run it first — the finish_media table will not exist until then.',
    };
  }
  return { ok: true };
}

const deleteSchema = z.object({
  vertical: z.string().trim().min(1).max(40),
  kind: kindSchema,
  mediaKey: z.string().trim().min(1).max(400),
});

export async function deleteFinishMediaAction(raw: unknown): Promise<FinishMediaResult> {
  if (!(await requireAdmin())) {
    return { ok: false, message: 'Not signed in as an admin. Sign in again and retry.' };
  }

  const parsed = deleteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: 'Nothing to remove.' };

  const ok = await deleteFinishMedia(parsed.data);
  return ok ? { ok: true } : { ok: false, message: 'Could not remove that. Try again.' };
}

const uploadSchema = z.object({
  contentType: z.string().trim().min(3).max(100),
});

export type FinishUploadResult =
  | { ok: true; path: string; token: string; publicUrl: string }
  | { ok: false; message: string };

/**
 * Mints a one-shot signed upload URL. The browser then PUTs the file straight
 * to Storage and writes the returned public address into `src`.
 *
 * The file does NOT come through this action — see lib/storage/toolMedia.ts. A
 * server action body is capped at 1 MB and base64 inflates by a third, which
 * would put a hard ~750 KB ceiling on a combination photograph that is
 * supposed to be shown a thousand pixels wide.
 */
export async function createFinishUploadAction(raw: unknown): Promise<FinishUploadResult> {
  if (!(await requireAdmin())) {
    return { ok: false, message: 'Not signed in as an admin. Sign in again and retry.' };
  }

  const parsed = uploadSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: 'That file could not be read. Try picking it again.' };
  }

  // Checked here as well as in the bucket so the operator gets a sentence
  // naming the problem, rather than a signed URL that fails silently on PUT.
  if (!toolMediaExtFor(parsed.data.contentType)) {
    return { ok: false, message: 'That file type is not accepted. Use a WebP, PNG or JPG.' };
  }

  const upload = await createToolMediaUpload('finishes', parsed.data.contentType);
  if (!upload) {
    return {
      ok: false,
      message:
        'Could not start the upload. If migration 0021 has not been run yet, run it first — the tool-media bucket will not exist until then.',
    };
  }

  return { ok: true, path: upload.path, token: upload.token, publicUrl: upload.publicUrl };
}
