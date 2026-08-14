'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
// From media-types, NOT media: this is a client component, and a value
// import from the server-only module puts it in the browser graph.
import { MIN_SLOTS, type MediaSlot } from '@/lib/tools/media-types';
import { ExpandButton, ImageViewer, type ViewerItem } from '@/components/tools/ImageViewer';

/**
 * components/tools/MediaGallery.tsx — the showcase at the top of a tool card.
 *
 * ============================================================================
 * PHASE 35: REBUILT, AND ON AN ENTIRELY NEW SET OF CLASS NAMES
 * ============================================================================
 *
 * WHAT WAS WRONG. The picture was small — `.tc-gallery .mg-stage` in
 * phase18.css pins it to 3:2 at card width, about a quarter of a phone screen
 * — it could not be opened any larger, there was no way to save one, and the
 * caption sat directly beneath the frame taking the space the picture wanted.
 * On a page whose entire job is to make somebody want a floor, the photograph
 * of the floor was the smallest thing on screen.
 *
 * WHY EVERY CLASS NAME CHANGED, `.mg-*` TO `.rv-*`. This stack has one
 * non-negotiable rule: a later layer ADDS, it never redefines a selector an
 * earlier layer owns. The old sizing lives in phase16.css (`.mg-stage`) and
 * phase18.css (`.tc-gallery .mg-stage`), both imported before anything new
 * can be. There is no legal way to make `.mg-stage` bigger from phase35.css.
 *
 * So the component asks for new names and phase35.css styles them from
 * nothing. The old rules are untouched and simply stop applying here — no
 * override, no specificity fight, and no risk to anything else that might use
 * them. Same move phase26.css made when it introduced `.tc-gallery-lead`
 * rather than editing `.tc-gallery`.
 *
 * `.tc-gallery` and `.tc-gallery-lead` still wrap it from ToolCard and still
 * own the outer margins. Only the inside is new. TOOLCARD IS UNCHANGED — the
 * props are the same two they always were.
 *
 * ============================================================================
 * WHAT IS DELIBERATELY KEPT
 * ============================================================================
 *
 * Everything about how it advances, because none of it was the problem:
 *
 * - Each slide holds for ITS OWN declared duration. The browser will not say
 *   when a GIF has finished, so the author does. A fixed interval would cut a
 *   six-second recording at three.
 * - The timer is a chain of one-shot timeouts, not an interval.
 * - Every frame stays mounted and cross-fades on opacity. Swapping one `src`
 *   restarts every GIF from frame zero and flashes white while the next file
 *   decodes. Only opacity animates: compositor only.
 * - Hidden tab pauses it. Reduced motion disables autoplay entirely and leaves
 *   a gallery the visitor drives — a designed state, not a broken one.
 * - It pads up to MIN_SLOTS with reserved frames when at least one real frame
 *   exists, and renders NOTHING when there are none. A gallery made entirely
 *   of empty boxes announces that the product is unfinished; an invisible one
 *   means nobody discovers the slots exist.
 * - A failed load swaps to a labelled placeholder rather than a torn-page
 *   glyph at the top of the page that is supposed to sell the product.
 *
 * NO SCROLL-TRIGGERED ANYTHING. IntersectionObserver is banned on these
 * surfaces and would be the wrong tool regardless. The tab check covers the
 * case that actually costs a visitor something.
 *
 * ============================================================================
 * THE THREE THINGS THAT ARE NEW
 * ============================================================================
 *
 * 1. THE STAGE IS MUCH LARGER, sized by `min-height` in viewport units rather
 *    than by aspect ratio alone — phase35.css explains why that is the only
 *    way to get a real increase on a narrow screen.
 *
 * 2. IT OPENS FULL SCREEN. Tapping the picture opens the shared viewer at
 *    `object-fit: contain`, which is the only place the whole frame is
 *    actually visible. There is a visible expand control as well as the tap
 *    target, because an expandable picture that looks exactly like a
 *    non-expandable one is a feature nobody finds.
 *
 * 3. IT CAN BE SAVED, from inside the viewer. These are Supabase public URLs
 *    on another origin, where a plain `download` attribute is silently
 *    ignored; lib/media/download.ts explains what is done instead.
 *
 * THE CAPTION MOVED BELOW THE DOTS. It was between the picture and the dots —
 * the one place on this component where vertical space is worth the most. It
 * is the least important element here and now sits last, quietly.
 *
 * AUTOPLAY STOPS WHILE THE VIEWER IS OPEN. Otherwise the frame behind advances
 * during the seconds somebody spends looking at a full-screen photograph, and
 * closing returns them to a different picture than the one they opened — which
 * reads as the app having lost their place.
 */

export interface MediaGalleryProps {
  slots: MediaSlot[];
  /** Used for the accessible label, e.g. "Instant floor quotes". */
  label: string;
}

export function MediaGallery({ slots, label }: MediaGalleryProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewing, setViewing] = useState<ViewerItem | null>(null);
  const timer = useRef<number>(0);

  const padding = slots.length > 0 ? Math.max(0, MIN_SLOTS - slots.length) : 0;
  const enough = slots.length > 0;
  const count = slots.length + padding;

  const clear = useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = 0;
    }
  }, []);

  useEffect(() => {
    if (!enough || count <= 1 || paused || viewing !== null) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // A reserved frame has no declared duration; it holds for the default.
    const hold = slots[index]?.durationMs ?? 3000;
    timer.current = window.setTimeout(() => {
      setIndex((i) => (i + 1) % count);
    }, hold);

    return clear;
  }, [index, count, paused, enough, slots, clear, viewing]);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const current = slots[index];

  const expand = useCallback(() => {
    const slot = slots[index];
    if (!slot) return;
    setViewing({
      src: slot.src,
      alt: slot.alt,
      caption: slot.caption,
      downloadName: label + '-' + slot.key,
    });
  }, [slots, index, label]);

  // AFTER the hooks, never before. Hooks declared below an early return is the
  // rules-of-hooks violation that broke FinishVisualiser in an earlier phase.
  if (!enough) return null;

  return (
    <figure className="rv" aria-roledescription="carousel" aria-label={label + ' — how it works'}>
      <div className="rv-stage">
        {slots.map((slot, i) => (
          <MediaFrame
            key={slot.key}
            slot={slot}
            active={i === index}
            eager={i === 0}
            onExpand={expand}
          />
        ))}
        {Array.from({ length: padding }, (_, n) => (
          <div
            key={'reserved-' + n}
            className={'rv-frame' + (slots.length + n === index ? ' rv-frame-on' : '')}
            aria-hidden={slots.length + n !== index}
          >
            <div className="rv-ph">
              <span className="rv-ph-k">Slot {slots.length + n + 1}</span>
              <span className="rv-ph-t">Add a recording in admin</span>
            </div>
          </div>
        ))}

        {/* Only over a real frame. A reserved slot has nothing to enlarge, and
            offering to expand an empty box is an invitation to disappointment. */}
        {current ? <ExpandButton onClick={expand} label="See this picture full size" /> : null}
      </div>

      <div className="rv-dots" role="tablist" aria-label="Choose a frame">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={'dot-' + i}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={slots[i]?.caption ?? 'Empty slot ' + (i + 1)}
            className={'rv-dot' + (i === index ? ' rv-dot-on' : '')}
            onClick={() => {
              clear();
              setIndex(i);
            }}
          />
        ))}
      </div>

      {/* aria-live so the caption is announced as it changes; the frames
          themselves are hidden from the tree when inactive. */}
      <figcaption className="rv-cap" aria-live="polite">
        {current?.caption ?? 'Nothing here yet'}
      </figcaption>

      <ImageViewer item={viewing} onClose={() => setViewing(null)} />
    </figure>
  );
}

function MediaFrame({
  slot,
  active,
  eager,
  onExpand,
}: {
  slot: MediaSlot;
  active: boolean;
  eager: boolean;
  onExpand: () => void;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={'rv-frame' + (active ? ' rv-frame-on' : '')} aria-hidden={!active}>
      {failed ? (
        <div className="rv-ph">
          <span className="rv-ph-k">Recording</span>
          <span className="rv-ph-t">{slot.caption}</span>
        </div>
      ) : (
        // A plain <img>, deliberately. next/image cannot serve an animated GIF
        // through the optimizer — it returns a single still frame — so routing
        // the showcase through it would silently kill the motion this section
        // exists for.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slot.src}
          alt={slot.alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed(true)}
          /* The whole frame is the tap target, not just the small control. On
             a phone the picture IS the button people reach for. Inactive
             frames are pointer-events: none in CSS, so only the visible one
             can be tapped. */
          onClick={onExpand}
        />
      )}
    </div>
  );
}
