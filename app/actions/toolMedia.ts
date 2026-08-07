'use server';

import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin';
import { MAX_SLOTS, replaceToolMedia } from '@/lib/tools/media';

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
