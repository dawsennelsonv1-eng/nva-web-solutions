'use server';

import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin';
import { MAX_SLOTS, replaceToolMedia } from '@/lib/tools/media';
import { createToolMediaUpload, toolMediaExtFor } from '@/lib/storage/toolMedia';

/**
 * app/actions/toolMedia.ts — save a tool's recordings.
 *
 * ============================================================================
 * AUTHORISATION — CLOSED IN PHASE 16F
 * ============================================================================
 *
 * This was the more exposed of the two unguarded actions: it writes image URLs
 * that render on public pages, so an unauthenticated caller could have put an
 * arbitrary picture on the front of the site.
 *
 * requireAdmin() (lib/auth/admin.ts) now runs FIRST, before the payload is even
 * parsed. It reads the cookie-bound session and calls the same is_admin() SQL
 * function middleware uses.
 *
 * THE SCHEMA BELOW STAYS AS THE SECOND LAYER, not because the guard is doubted
 * but because they answer different questions. The guard answers "may this
 * person write here"; the schema answers "is this a sane thing to write" — it
 * accepts only a root-relative path or an https:// URL, so `data:`,
 * `javascript:` and protocol-relative values are rejected even for an admin who
 * pastes the wrong thing.
 */

const slot = z.object({
  kind: z.enum(['animation', 'still']),
  src: z
    .string()
    .trim()
    .min(3)
    .max(500)
    .refine((v) => (v.startsWith('/') && !v.startsWith('//')) || v.startsWith('https://'), {
      message: 'Use a path starting with / or a full https:// address.',
    }),
  alt: z.string().trim().min(3).max(300),
  caption: z.string().trim().min(1).max(120),
  durationMs: z.number().int().min(800).max(30000),
});

const schema = z.object({
  toolId: z.string().trim().min(1).max(60),
  slots: z.array(slot).max(MAX_SLOTS),
});

export type SaveMediaResult = { ok: true; count: number } | { ok: false; message: string };

export async function saveToolMediaAction(raw: unknown): Promise<SaveMediaResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, message: 'Not signed in as an admin. Sign in again and retry.' };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue?.message ?? 'Check the fields and try again.' };
  }

  const wrote = await replaceToolMedia(parsed.data.toolId, parsed.data.slots);
  if (!wrote) {
    return {
      ok: false,
      message: 'That could not be saved. If migration 0019 has not been run yet, run it first.',
    };
  }
  return { ok: true, count: parsed.data.slots.length };
}

// ---------------------------------------------------------------------------
// uploading a file — added because there was no way to add one at all
// ---------------------------------------------------------------------------

/**
 * THE GAP THIS CLOSES, stated plainly: the editor's `src` field was a TEXT
 * INPUT and nothing else. It expected a path like /tools/epoxy/01.gif — which
 * means a file already committed under /public, which means a laptop, a git
 * client and a deploy. The operator works from a phone. There was no route
 * from "I have a picture" to "the picture is on the site", and the screen gave
 * no hint that one was missing: an empty box that accepts typing looks like a
 * box you are supposed to type in.
 *
 * This mints a one-shot signed upload URL. The browser then PUTs the file
 * directly to Storage and writes the returned public URL into `src`, which the
 * schema above already accepts because it is an https:// address.
 *
 * WHY THE FILE DOES NOT COME THROUGH THIS ACTION: see lib/storage/toolMedia.ts.
 * A server action body is capped at 1 MB, which after base64 is a ~750 KB
 * ceiling on a recording, against a bucket that allows 8 MB.
 */
const uploadSchema = z.object({
  toolId: z.string().trim().min(1).max(60),
  contentType: z.string().trim().min(3).max(100),
});

export type ToolMediaUploadResult =
  | { ok: true; path: string; token: string; publicUrl: string }
  | { ok: false; message: string };

export async function createToolMediaUploadAction(
  raw: unknown
): Promise<ToolMediaUploadResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, message: 'Not signed in as an admin. Sign in again and retry.' };
  }

  const parsed = uploadSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: 'That file could not be read. Try picking it again.' };
  }

  // Checked here as well as in the bucket so the operator gets a sentence
  // naming the problem, rather than a signed URL that fails silently on PUT.
  if (!toolMediaExtFor(parsed.data.contentType)) {
    return {
      ok: false,
      message:
        'That file type is not accepted. Use a GIF, WebP, PNG, JPG or MP4.',
    };
  }

  const upload = await createToolMediaUpload(parsed.data.toolId, parsed.data.contentType);
  if (!upload) {
    return {
      ok: false,
      message:
        'Could not start the upload. If migration 0021 has not been run yet, run it first — the tool-media bucket will not exist until then.',
    };
  }

  return { ok: true, path: upload.path, token: upload.token, publicUrl: upload.publicUrl };
}
