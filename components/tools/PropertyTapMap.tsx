'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { measureFromTaps, type LatLng } from '@/lib/measure/geo';
import { latLngToTap, staticMapUrl, type MapFrame } from '@/lib/measure/mercator';

/**
 * PropertyTapMap — the homeowner points at their own boundary.
 *
 * ============================================================================
 * WHY THIS IS WORTH A COMPONENT AT ALL
 * ============================================================================
 *
 * Every vertical here measures from a photograph, and every one of those
 * measurements carries a confidence score because a single frame is a weak
 * source of scale. Fencing has it worst: a boundary receding from the camera is
 * foreshortened, which is the classic way to underestimate a run.
 *
 * A tapped boundary has none of that. The person is not estimating — they are
 * pointing at their own fence line on a picture of their own property, and the
 * distance between two coordinates is not a matter of opinion. So when this
 * component produces a measurement it should REPLACE the vision estimate rather
 * than be averaged with it.
 *
 * ============================================================================
 * IT IS ENTIRELY OPTIONAL, AND THAT IS LOAD-BEARING
 * ============================================================================
 *
 * Without an API key there is no image, and without an image there is nothing
 * to tap. The component renders nothing at all in that case and the flow falls
 * back to the photo estimate and manual entry, both of which already work.
 *
 * That is why the key arrives as a PROP rather than being read here: a
 * `process.env` reference in a client component is a value baked into the
 * bundle, and the decision about what to expose belongs to the server. A Maps
 * static key is browser-visible by nature — it travels in the image URL — so it
 * must be HTTP-referrer restricted in the Cloud console. An unrestricted key in
 * a public URL is somebody else's map quota billed to this account.
 *
 * ============================================================================
 * THE TAP MATHS, AND THE ONE MISTAKE THAT MATTERS
 * ============================================================================
 *
 * The image is REQUESTED at a logical size and DISPLAYED at whatever width the
 * layout gives it, which on a phone is almost never the same number. So a tap
 * is normalised against the displayed box from getBoundingClientRect and passed
 * to the projection as a FRACTION. Mixing displayed pixels with requested
 * pixels would scale every measurement by a constant factor — and it would look
 * plausible, which is what makes it dangerous.
 */

export interface PropertyTapMapProps {
  /** Referrer-restricted static maps key, decided server-side. */
  apiKey: string | null;
  /** Where to frame. Geocoded from an address, or the centre of the lot. */
  center: LatLng | null;
  /**
   * Closed for a perimeter, open for a run.
   *
   * DEFAULTS TO OPEN because the common fencing job is three sides of a back
   * yard with the house closing the fourth. Auto-closing that would add a leg
   * across the building and quote fence nobody is buying.
   */
  closed?: boolean;
  /** Fires on every change, including back to nothing. */
  onMeasure: (m: { linearFt: number; areaSqft: number; confidence: number }) => void;
  label?: string;
}

/** Zoom 20 frames a residential lot with room around it. */
const DEFAULT_ZOOM = 20;
const REQUEST_SIZE = 640;

export function PropertyTapMap({
  apiKey,
  center,
  closed = false,
  onMeasure,
  label = 'Tap the corners of your fence line',
}: PropertyTapMapProps) {
  const [points, setPoints] = useState<LatLng[]>([]);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const frame = useMemo<MapFrame | null>(() => {
    if (!center) return null;
    return {
      center,
      zoom: DEFAULT_ZOOM,
      widthPx: REQUEST_SIZE,
      heightPx: REQUEST_SIZE,
      /* Density only. It does not change what the frame covers, and the
         projection divides it out. */
      scale: 2,
    };
  }, [center]);

  const emit = useCallback(
    (next: LatLng[]) => {
      const m = measureFromTaps(next, { closed });
      onMeasure({ linearFt: m.linearFt, areaSqft: m.areaSqft, confidence: m.confidence });
    },
    [closed, onMeasure]
  );

  const handleTap = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      const el = imgRef.current;
      if (!el || !frame) return;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      // Fractions of the DISPLAYED box. See the note at the head of this file.
      const xFraction = (e.clientX - rect.left) / rect.width;
      const yFraction = (e.clientY - rect.top) / rect.height;
      if (xFraction < 0 || xFraction > 1 || yFraction < 0 || yFraction > 1) return;

      // Imported lazily at call time rather than at module scope so the
      // projection never runs during render.
      import('@/lib/measure/mercator')
        .then(({ tapToLatLng }) => {
          const point = tapToLatLng(frame, { xFraction, yFraction });
          setPoints((prev) => {
            const next = [...prev, point];
            emit(next);
            return next;
          });
        })
        .catch(() => {
          /* A failed dynamic import leaves the map inert rather than throwing
             into a render. Manual entry is still there. */
        });
    },
    [frame, emit]
  );

  const undo = useCallback(() => {
    setPoints((prev) => {
      const next = prev.slice(0, -1);
      emit(next);
      return next;
    });
  }, [emit]);

  const clear = useCallback(() => {
    setPoints([]);
    emit([]);
  }, [emit]);

  // Nothing to show without a key or a location. Deliberately silent: the flow
  // has two working measurement routes without this one.
  if (!apiKey || !frame) return null;

  const measurement = measureFromTaps(points, { closed });
  const markers = points.map((p) => latLngToTap(frame, p));

  return (
    <div className="ptm">
      <p className="ptm-label">{label}</p>

      <div className="ptm-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          className="ptm-img"
          src={staticMapUrl(frame, apiKey)}
          alt="Satellite view of the property"
          onClick={handleTap}
          decoding="async"
        />

        {markers.map((m, i) => (
          <span
            key={i}
            className="ptm-dot"
            style={{ left: (m.xFraction * 100).toFixed(3) + '%', top: (m.yFraction * 100).toFixed(3) + '%' }}
            aria-hidden="true"
          />
        ))}
      </div>

      <div className="ptm-readout">
        {points.length < 2 ? (
          <span>Tap at least two corners.</span>
        ) : (
          <span>
            <b>{measurement.linearFt.toLocaleString('en-US')} ft</b>
            {closed && measurement.areaSqft > 0
              ? ' around · ' + measurement.areaSqft.toLocaleString('en-US') + ' sq ft'
              : ' of fence'}
          </span>
        )}

        <span className="ptm-actions">
          <button type="button" className="ptm-btn" onClick={undo} disabled={points.length === 0}>
            Undo
          </button>
          <button type="button" className="ptm-btn" onClick={clear} disabled={points.length === 0}>
            Clear
          </button>
        </span>
      </div>

      {measurement.warnings.map((w) => (
        <p key={w} className="ptm-warn">
          {w}
        </p>
      ))}
    </div>
  );
}
