'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MIN_SLOTS, type MediaSlot } from '@/lib/tools/media';

/**
 * components/tools/MediaGallery.tsx — the showcase at the top of a tool page.
 *
 * ============================================================================
 * HOW IT ADVANCES
 * ============================================================================
 *
 * Each slide holds for its own declared duration and then moves on. Animations
 * declare the length of the recording; stills use three seconds. The reason
 * duration is per-slide rather than a fixed timer is in lib/tools/media.ts: the
 * browser will not tell us when a GIF has finished, so the author says.
 *
 * The timer is a chain of one-shot timeouts, not an interval. An interval fires
 * on a fixed beat regardless of what is on screen, which would cut a six-second
 * recording at three. Each slide schedules the next one.
 *
 * ============================================================================
 * WHY THE FRAMES ARE ALL MOUNTED AT ONCE
 * ============================================================================
 *
 * Every slide stays in the DOM and cross-fades on opacity. Swapping the `src`
 * of a single <img> would restart every GIF from frame zero on each visit and
 * flash white while the next file decodes. Mounted frames also mean an
 * animation is already running when its slide arrives, rather than starting a
 * beat late.
 *
 * The cost is that all slides load up front, which is why MAX_SLOTS is ten and
 * why the first slide is eager while the rest are lazy — the visitor sees frame
 * one immediately and the others arrive during the seconds he spends on it.
 *
 * Only opacity animates. No layout, no paint, compositor only.
 *
 * ============================================================================
 * WHEN IT STOPS
 * ============================================================================
 *
 * - Hidden tab: paused, via visibilitychange. Ten mounted GIFs cycling behind a
 *   background tab is a battery bill for nothing.
 * - Reduced motion: no autoplay at all. The first slide holds and the dots
 *   still work. This is a designed state, not a broken one — a person who has
 *   asked their operating system to stop moving things gets a gallery he drives.
 * - One slide: no timer is ever started.
 *
 * NO SCROLL-TRIGGERED ANYTHING. 13A build constraint 4 bans IntersectionObserver
 * on these surfaces, so the gallery does not know or care where the viewport is.
 * The tab check covers the case that actually costs a user something.
 *
 * ============================================================================
 * MISSING FILES ARE A DESIGNED STATE
 * ============================================================================
 *
 * None of the recordings exist yet. A broken <img> would put a torn-page glyph
 * at the top of the page that is supposed to sell the product, so a failed load
 * swaps to a labelled placeholder carrying that slide's caption. The gallery
 * stays the right shape and the page stays honest — it shows a frame reserved
 * for a recording rather than a fake screenshot of a thing that never happened.
 */

export interface MediaGalleryProps {
  slots: MediaSlot[];
  /** Used for the accessible label, e.g. "Instant floor quotes". */
  label: string;
}

export function MediaGallery({ slots, label }: MediaGalleryProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number>(0);

  // Below three filled slots this is a shortage, not a showcase. Render
  // nothing rather than a two-frame carousel that undersells the tool.
  const enough = slots.length >= MIN_SLOTS;
  const count = slots.length;

  const clear = useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = 0;
    }
  }, []);

  useEffect(() => {
    if (!enough || count <= 1 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const current = slots[index];
    const hold = current?.durationMs ?? 3000;
    timer.current = window.setTimeout(() => {
      setIndex((i) => (i + 1) % count);
    }, hold);

    return clear;
  }, [index, count, paused, enough, slots, clear]);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (!enough) return null;

  return (
    <figure className="mg" aria-roledescription="carousel" aria-label={label + ' — how it works'}>
      <div className="mg-stage">
        {slots.map((slot, i) => (
          <MediaFrame key={slot.key} slot={slot} active={i === index} eager={i === 0} />
        ))}
      </div>

      {/* aria-live so the caption is announced as it changes; the frames
          themselves are hidden from the tree when inactive. */}
      <figcaption className="mg-cap" aria-live="polite">
        {slots[index]?.caption ?? ''}
      </figcaption>

      <div className="mg-dots" role="tablist" aria-label="Choose a frame">
        {slots.map((slot, i) => (
          <button
            key={slot.key}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={slot.caption}
            className={'mg-dot' + (i === index ? ' mg-dot-on' : '')}
            onClick={() => {
              clear();
              setIndex(i);
            }}
          />
        ))}
      </div>
    </figure>
  );
}

function MediaFrame({
  slot,
  active,
  eager,
}: {
  slot: MediaSlot;
  active: boolean;
  eager: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={'mg-frame' + (active ? ' mg-frame-on' : '')} aria-hidden={!active}>
      {failed ? (
        <div className="mg-ph">
          <span className="mg-ph-k">Recording</span>
          <span className="mg-ph-t">{slot.caption}</span>
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
        />
      )}
    </div>
  );
}
