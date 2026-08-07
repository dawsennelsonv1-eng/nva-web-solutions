/**
 * lib/tools/media.ts — the pictures and animations shown on a tool page.
 *
 * ============================================================================
 * WHAT THIS IS FOR
 * ============================================================================
 *
 * This is the "wow factor" surface. On the homepage card and at the top of
 * every tool page, a visitor should see the thing WORKING before he reads a
 * word about it. That is what a screen recording does and a paragraph cannot.
 *
 * ============================================================================
 * SLOTS: THREE MINIMUM, TEN MAXIMUM, SHOW WHAT EXISTS
 * ============================================================================
 *
 * Each tool has an ordered list of up to ten slots. Fewer than three and the
 * gallery does not render at all — two frames is not a showcase, it is a
 * shortage, and an almost-empty carousel undersells a tool worse than no
 * carousel does. The gallery shows exactly as many as are filled.
 *
 * ANIMATION FIRST. Slots are sorted so animated media leads, because motion is
 * what makes somebody stop scrolling. Within a kind, the author's order holds.
 *
 * ============================================================================
 * DURATION, AND THE THING BROWSERS WILL NOT TELL YOU
 * ============================================================================
 *
 * The brief asked that a slide advance after three seconds OR when the animation
 * has finished playing, whichever fits. The second half of that is not
 * available: a browser gives no event when an animated GIF or WebP completes a
 * loop, and no way to read its length. Nothing in the platform exposes it.
 *
 * So each slot declares its own `durationMs`, and the person adding the file
 * types in how long it runs. That is honest and it is better than the
 * alternative, which is a three-second timer cutting a five-second recording in
 * half every time. Stills use the three-second default.
 *
 * ============================================================================
 * WHERE THIS GOES NEXT — READ BEFORE BUILDING THE ADMIN SCREEN
 * ============================================================================
 *
 * The brief is that these are managed from admin. This file is deliberately
 * shaped as the thing an admin screen would WRITE, not as hardcoded markup:
 * a flat, ordered, serialisable list per tool id.
 *
 * The migration path is therefore a table (`tool_media`: tool_id, position,
 * kind, src, alt, caption, duration_ms) and swapping `mediaForTool` for a query
 * against it. Every consumer already treats the result as async-shaped data
 * rather than a constant, so the components do not change when that happens.
 *
 * THE ENTRIES BELOW ARE MOCKUPS AND THE FILES DO NOT EXIST YET. That is
 * deliberate and it is safe: `MediaGallery` renders a designed placeholder for
 * any slot whose file is missing, so the page is complete and correct today and
 * gets better as real recordings land. Nothing here fabricates a screenshot of
 * a product state that has never happened.
 */

export type MediaKind = 'animation' | 'still';

export interface MediaSlot {
  /** Stable key. Referenced by catalogue.ts story points. */
  key: string;
  kind: MediaKind;
  /** Path under /public. .gif and animated .webp both count as animation. */
  src: string;
  /** Required. Describes what is happening, not what the file is. */
  alt: string;
  /** Shown under the frame in the gallery. Keep it to a short line. */
  caption: string;
  /** How long this slide holds, in milliseconds. */
  durationMs: number;
}

export const MIN_SLOTS = 3;
export const MAX_SLOTS = 10;
export const DEFAULT_DURATION_MS = 3000;

const MEDIA: Record<string, MediaSlot[]> = {
  epoxy: [
    {
      key: 'epoxy-visualiser',
      kind: 'animation',
      src: '/tools/epoxy/01-visualiser.gif',
      alt: 'A photo of a bare garage floor turning into the same floor with a metallic coating on it',
      caption: 'Their own garage, finished',
      durationMs: 6000,
    },
    {
      key: 'epoxy-widget-quote',
      kind: 'animation',
      src: '/tools/epoxy/02-quote.gif',
      alt: 'Somebody dragging the area control and a price range moving with it',
      caption: 'A real range in under a minute',
      durationMs: 5000,
    },
    {
      key: 'epoxy-lead',
      kind: 'animation',
      src: '/tools/epoxy/03-lead.gif',
      alt: 'A completed enquiry arriving with name, phone, job size and photo',
      caption: 'The lead lands either way',
      durationMs: 4000,
    },
    {
      key: 'epoxy-rates',
      kind: 'still',
      src: '/tools/epoxy/04-rates.webp',
      alt: 'The rate table in the dashboard, with every figure editable',
      caption: 'Every number is yours to set',
      durationMs: DEFAULT_DURATION_MS,
    },
    {
      key: 'epoxy-widget-mobile',
      kind: 'still',
      src: '/tools/epoxy/05-mobile.webp',
      alt: 'The quoting widget on a phone, one-handed, in daylight',
      caption: 'Built for the phone first',
      durationMs: DEFAULT_DURATION_MS,
    },
  ],
  painting: [],
};

/**
 * Ordered, capped, animation-first. Async-shaped on purpose — see the migration
 * note above; when this becomes a table query, no caller changes.
 */
export async function mediaForTool(toolId: string): Promise<MediaSlot[]> {
  const slots = MEDIA[toolId] ?? [];
  const animations = slots.filter((s) => s.kind === 'animation');
  const stills = slots.filter((s) => s.kind === 'still');
  return [...animations, ...stills].slice(0, MAX_SLOTS);
}

export function mediaSlotByKey(slots: MediaSlot[], key: string | null): MediaSlot | undefined {
  if (!key) return undefined;
  return slots.find((s) => s.key === key);
}
