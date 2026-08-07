'use server';

import { z } from 'zod';
import { MAX_SLOTS, replaceToolMedia } from '@/lib/tools/media';

/**
 * app/actions/toolMedia.ts — save a tool's recordings.
 *
 * ============================================================================
 * VERIFY — AUTHORISATION
 * ============================================================================
 *
 * Like app/actions/appearance.ts, this does NOT check who is calling it. Server
 * actions are reachable from any browser, and I have not seen the admin session
 * helper — app/admin/ai/page.tsx says Phase 8 owns it and stands in with a
 * hardcoded constant.
 *
 * THE EXPOSURE HERE IS LARGER THAN THE THEME SWITCH. This writes image URLs
 * that render on public pages, so an unauthenticated caller could put an
 * arbitrary picture on the front of the site.
 *
 * It is bounded: the schema below accepts only a root-relative path or an
 * https:// URL, so `data:`, `javascript:` and protocol-relative values are all
 * rejected, and the value is only ever used as an <img src>. Nothing here can
 * execute. But it is a real gap and it is worth closing before this URL is
 * public knowledge.
 *
 * TO CLOSE IT: import whatever guard app/admin/layout.tsx uses and call it as
 * the first line of the function. One line, same as the theme action.
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
