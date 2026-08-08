import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * lib/tools/media.ts — the pictures and animations shown for a tool.
 *
 * ============================================================================
 * PHASE 16E: THIS READS THE DATABASE NOW
 * ============================================================================
 *
 * It used to be a hardcoded manifest, which meant adding one GIF was a code
 * change and a deploy. Rows now come from `tool_media` and are edited at
 * /admin/media.
 *
 * NO CONSUMER CHANGED. `mediaForTool` was written async from the start against
 * exactly this migration, so MediaGallery, ToolStory, ToolDeck and the tool
 * page all compile untouched. That was the point of shaping it that way.
 *
 * ============================================================================
 * DURATION, AND THE THING BROWSERS WILL NOT TELL YOU
 * ============================================================================
 *
 * The brief asked that a slide advance after three seconds OR when its
 * animation has finished playing. The second half is not available: no browser
 * fires an event when an animated GIF or WebP completes a loop, and none
 * exposes its length. Nothing in the platform has it.
 *
 * So each row carries its own duration and whoever adds the file types in how
 * long it runs. That is honest, and it beats the alternative — a fixed
 * three-second timer cutting every six-second recording in half.
 *
 * ============================================================================
 * ANIMATION FIRST, THEN AUTHOR ORDER
 * ============================================================================
 *
 * Motion is what stops a scroll, so animated slots lead regardless of the
 * position they were saved in. Within a kind, the operator's order holds. The
 * editor therefore shows the order he set, and the page may lead with a later
 * one — that is intended, and the editor says so.
 *
 * ============================================================================
 * CACHING AND FAILURE
 * ============================================================================
 *
 * Cached under a tag that the admin action invalidates, so a save is live on
 * the next request and the steady-state cost is zero queries. A failed read or
 * a missing table returns an empty list, and fewer than MIN_SLOTS renders no
 * gallery — so the site is correct, not broken, in the window between deploying
 * this and running migration 0019.
 */

/**
 * The shape, the limits and the pure lookup live in ./media-types, which is NOT
 * server-only and can therefore be imported by client components. They are
 * re-exported here so server callers still have a single import.
 *
 * DO NOT MOVE THEM BACK. A value import of MIN_SLOTS from a client component
 * pulls this whole module into the browser graph, `server-only` throws, and the
 * build fails with a message about the pages/ directory that points nowhere
 * near the real cause. That is exactly how this broke in 16E.
 */
export type { MediaKind, MediaSlot } from '@/lib/tools/media-types';
export {
  MIN_SLOTS,
  MAX_SLOTS,
  DEFAULT_DURATION_MS,
  mediaSlotByKey,
} from '@/lib/tools/media-types';

// Re-exporting a name does NOT bind it locally, so the shapes this file
// actually uses are imported as well.
import type { MediaKind, MediaSlot } from '@/lib/tools/media-types';
import { MAX_SLOTS } from '@/lib/tools/media-types';

/** Cache tag. Invalidated by replaceToolMedia so a save is live immediately. */
export const MEDIA_TAG = 'tool-media';

interface Row {
  tool_id: string;
  position: number;
  kind: string;
  src: string;
  alt: string;
  caption: string;
  duration_ms: number;
}

/**
 * No cast. types/database.ts gained `tool_media` in Phase 16K, so both the read
 * and the upsert below are checked against the real column list.
 *
 * The rows are still re-shaped into MediaSlot rather than handed out as they
 * arrive — the database's snake_case columns are not this module's public API,
 * and MediaGallery should never know what a `duration_ms` is.
 */
function client() {
  return getSupabaseAdminClient();
}

function toSlot(r: Row): MediaSlot {
  return {
    key: r.tool_id + '-' + r.position,
    kind: r.kind === 'animation' ? 'animation' : 'still',
    src: r.src,
    alt: r.alt,
    caption: r.caption,
    durationMs: r.duration_ms,
  };
}

const readMedia = unstable_cache(
  async (toolId: string): Promise<MediaSlot[]> => {
    try {
      const { data } = await client()
        .from('tool_media')
        .select('tool_id, position, kind, src, alt, caption, duration_ms')
        .eq('tool_id', toolId)
        .order('position', { ascending: true });
      return (data ?? []).map(toSlot);
    } catch {
      return [];
    }
  },
  ['tool-media'],
  { tags: [MEDIA_TAG], revalidate: 3600 }
);

/** Ordered animation-first, capped at MAX_SLOTS. */
export async function mediaForTool(toolId: string): Promise<MediaSlot[]> {
  const slots = await readMedia(toolId);
  const animations = slots.filter((s) => s.kind === 'animation');
  const stills = slots.filter((s) => s.kind === 'still');
  return [...animations, ...stills].slice(0, MAX_SLOTS);
}

/** In saved order, not display order — this is what the editor shows. */
export async function mediaForToolInEditOrder(toolId: string): Promise<MediaSlot[]> {
  return readMedia(toolId);
}

export interface MediaSlotInput {
  kind: MediaKind;
  src: string;
  alt: string;
  caption: string;
  durationMs: number;
}

/**
 * Replaces every slot for one tool.
 *
 * REPLACE, NOT PATCH, and that is the safer operation here. Per-row editing
 * needs the caller to track which rows moved, which were deleted and which are
 * new, and any mistake shows up as a duplicated or vanished frame on the public
 * page. Rewriting positions 0..n-1 makes the saved state exactly what the
 * operator saw on screen.
 *
 * Two statements rather than one transaction, because the JS client has no
 * transaction API. Upsert first, then delete the tail: in that order a failure
 * between them leaves EXTRA old slots, which is visible and fixable. The other
 * order would delete first and could leave the tool with none.
 */
export async function replaceToolMedia(
  toolId: string,
  slots: MediaSlotInput[]
): Promise<boolean> {
  const capped = slots.slice(0, MAX_SLOTS);
  try {
    const db = client();
    if (capped.length > 0) {
      const { error } = await db.from('tool_media').upsert(
        capped.map((s, i) => ({
          tool_id: toolId,
          position: i,
          kind: s.kind,
          src: s.src,
          alt: s.alt,
          caption: s.caption,
          duration_ms: s.durationMs,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'tool_id,position' }
      );
      if (error) return false;
    }
    const { error: delError } = await db
      .from('tool_media')
      .delete()
      .eq('tool_id', toolId)
      .gte('position', capped.length);
    if (delError) return false;

    revalidateTag(MEDIA_TAG);
    return true;
  } catch {
    return false;
  }
}
