/**
 * lib/tools/media-types.ts — the shape of a media slot, and nothing else.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS: A REAL BUILD FAILURE, NOT TIDINESS
 * ============================================================================
 *
 * lib/tools/media.ts is `server-only` — it reads the database with the service
 * role client, and that import is what guarantees the key can never be pulled
 * into a browser bundle.
 *
 * Three CLIENT components legitimately need the shape and the limits:
 *
 *   components/tools/MediaGallery.tsx     MIN_SLOTS, MediaSlot
 *   components/admin/ToolMediaEditor.tsx  MIN_SLOTS, MAX_SLOTS,
 *                                         DEFAULT_DURATION_MS, MediaSlot
 *   components/site/ToolCard.tsx          MediaSlot
 *
 * A type-only import (`import type { MediaSlot }`) is erased before webpack
 * sees it, so ToolCard was fine. A VALUE import of a constant is not erased —
 * it pulls the whole module into the client graph, `server-only` throws, and
 * the build fails with a message about the pages/ directory that has nothing to
 * do with the actual problem.
 *
 * That is exactly what happened when media.ts became database-backed in 16E.
 * The constants had lived beside the data since the file was a static manifest,
 * and adding `server-only` to it made every existing client import illegal
 * without any of them changing.
 *
 * ============================================================================
 * THE RULE THIS FILE ENCODES
 * ============================================================================
 *
 * A `server-only` module must not also be the home of constants and types that
 * client code needs. Split them, and let the server module re-export so server
 * callers still have one import.
 *
 * NOTHING IN HERE MAY TOUCH THE DATABASE, next/cache, OR process.env. If a
 * function needs any of those it belongs in media.ts. Keeping this file inert
 * is what keeps it safe to import from anywhere.
 */

export type MediaKind = 'animation' | 'still';

export interface MediaSlot {
  /** Stable key. Referenced by catalogue.ts story points. */
  key: string;
  kind: MediaKind;
  /** A path under /public, or an absolute https URL. */
  src: string;
  /** Required. Describes what is happening, not what the file is. */
  alt: string;
  /** Shown under the frame in the gallery. One short line. */
  caption: string;
  /**
   * How long this slide holds, in milliseconds.
   *
   * Per-slot rather than a fixed timer because the browser gives no event when
   * an animated GIF or WebP finishes a loop, and no way to read its length.
   * Whoever adds the file types in how long it runs. A fixed three seconds
   * would cut a six-second recording in half every time.
   */
  durationMs: number;
}

/** Below this many filled slots the gallery renders nothing at all. */
export const MIN_SLOTS = 3;

/** Hard ceiling: MediaGallery mounts every frame at once. */
export const MAX_SLOTS = 10;

export const DEFAULT_DURATION_MS = 3000;

/**
 * Pure lookup — no I/O, so it lives here rather than in the server module and
 * can be called from either side.
 */
export function mediaSlotByKey(slots: MediaSlot[], key: string | null): MediaSlot | undefined {
  if (!key) return undefined;
  return slots.find((s) => s.key === key);
}
