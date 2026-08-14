'use client';

import { useCallback, useEffect, useState } from 'react';
import { downloadImage } from '@/lib/media/download';

/**
 * components/tools/ImageViewer.tsx — ONE full-screen viewer, three surfaces.
 *
 * ============================================================================
 * WHY THIS IS SHARED AND NOT WRITTEN THREE TIMES
 * ============================================================================
 *
 * The gallery on a tool card, the combination preview in the picker and the
 * result rows in the admin combination studio all had the same two problems:
 * the picture is small, and there is no way to get it out. Written separately
 * they would drift — three escape handlers, three download buttons, three
 * subtly different ideas of what "expand" means — and the download in
 * particular is the part that is easy to get quietly wrong (see
 * lib/media/download.ts for why an anchor is not enough).
 *
 * So it is one component with one behaviour, and each surface passes it an
 * item.
 *
 * ============================================================================
 * A FIXED OVERLAY, NOT `<dialog>`
 * ============================================================================
 *
 * `<dialog showModal()>` gives focus trapping and the top layer for free, and
 * it would be the right answer on a greenfield page. It is the wrong answer
 * here: it can only be opened from an effect against a ref, its backdrop is
 * styled through a pseudo-element this design system has no rules for, and its
 * behaviour when a `position: sticky` ancestor is involved differs between
 * WebKit and Blink. The picker's whole layout depends on sticky working
 * exactly as phase30.css describes.
 *
 * A fixed overlay at inset 0 is fully controlled, needs no ref, and cannot
 * interact with the sticky machinery at all.
 *
 * ============================================================================
 * SCROLL LOCK, AND THE ONE THING TO BE CAREFUL ABOUT
 * ============================================================================
 *
 * The page behind is frozen while the viewer is open, otherwise a scroll
 * gesture over a full-screen photograph moves the page underneath it and the
 * viewer feels broken.
 *
 * It is done by writing `overflow: hidden` to `document.body` and restoring
 * THE PREVIOUS INLINE VALUE on close — not by clearing it. Something else may
 * legitimately own that property; restoring blindly to '' would take it away.
 *
 * Note for anyone reading phase30.css's warning about scroll containers: this
 * does make body a scroll container for as long as the viewer is open, which
 * would affect `.fp-hero`'s sticky behaviour. It does not matter, because the
 * picker is completely covered while that is true, and the value is put back
 * before it is visible again.
 */

export interface ViewerItem {
  src: string;
  alt: string;
  caption?: string;
  /** Basis for the saved file name. The combination key, where there is one. */
  downloadName?: string;
}

const VIDEO_RE = /^[^?]+\.(mp4|webm|mov)(\?|$)/i;

export function ImageViewer({ item, onClose }: { item: ViewerItem | null; onClose: () => void }) {
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const open = item !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // A fresh item means a fresh status line; a note left over from the previous
  // picture would describe a download that has nothing to do with this one.
  useEffect(() => {
    setNote(null);
  }, [item?.src]);

  const save = useCallback(async () => {
    if (!item) return;
    setSaving(true);
    try {
      const outcome = await downloadImage(item.src, item.downloadName ?? item.alt ?? 'girder');
      setNote(
        outcome === 'downloaded'
          ? 'Saved to your downloads.'
          : 'Your browser would not save it directly, so it is open in a new tab — long-press to save it from there.'
      );
    } catch {
      setNote('It could not be saved. Long-press the picture to save it instead.');
    } finally {
      setSaving(false);
    }
  }, [item]);

  if (!item) return null;

  const isVideo = VIDEO_RE.test(item.src);

  return (
    <div
      className="lb"
      role="dialog"
      aria-modal="true"
      aria-label={item.alt || 'Full size picture'}
      /* The backdrop closes it. The panel below stops the event, so a tap on
         the picture itself does not dismiss the thing you just opened. */
      onClick={onClose}
    >
      <div className="lb-panel" onClick={(e) => e.stopPropagation()}>
        <div className="lb-bar">
          <button type="button" className="lb-x" onClick={onClose} aria-label="Close">
            Close
          </button>
          <button
            type="button"
            className="lb-save"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Download'}
          </button>
        </div>

        {isVideo ? (
          <video className="lb-media" src={item.src} autoPlay muted loop playsInline controls />
        ) : (
          /* `contain`, not `cover`. This is the surface whose entire job is to
             show the whole picture — cropping here would defeat the reason
             somebody tapped expand. */
          // eslint-disable-next-line @next/next/no-img-element
          <img className="lb-media" src={item.src} alt={item.alt} />
        )}

        {item.caption ? <p className="lb-cap">{item.caption}</p> : null}
        {note ? (
          <p className="lb-note" role="status">
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The small control that sits on a picture and opens the viewer.
 *
 * Exported so the three surfaces draw the same affordance. An expandable
 * picture that looks identical to a non-expandable one is not a feature
 * anybody finds — the whole complaint that produced this component was that
 * the pictures "aren't expandable", when the real problem was that nothing
 * said they were.
 */
export function ExpandButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="lb-open" onClick={onClick} aria-label={label}>
      <span aria-hidden>⤢</span>
    </button>
  );
}
