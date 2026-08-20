'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { geocodeAddressAction } from '@/app/actions/geocode';
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
  /**
   * Referrer-restricted static maps key. OPTIONAL, and when omitted it is read
   * from NEXT_PUBLIC_GOOGLE_MAPS_KEY. PHASE 82.
   *
   * THE ORIGINAL DESIGN TOOK THIS ONLY AS A PROP, reasoning that a
   * `process.env` reference in a client component bakes the value into the
   * bundle. That is true and it is beside the point for a NEXT_PUBLIC_ variable
   * — being in the bundle is what the prefix MEANS, and a static maps key is
   * browser-visible by nature because it travels inside the image URL. The
   * protection is the HTTP referrer restriction, not secrecy.
   *
   * What the prop-only design actually bought was a plumbing problem:
   * `WidgetConfig` carries no such field, so the key could not reach here
   * without a core change. Reading the public var directly removes that, and
   * the prop stays for callers that would rather pass it.
   */
  apiKey?: string | null;
  /**
   * Where to frame. OPTIONAL as of phase 82: when absent the component asks for
   * an address and geocodes it itself.
   *
   * SELF-CONTAINED ON PURPOSE. Splitting the address into its own widget step
   * would have needed a text control kind the widget does not have, plus an
   * action call from the widget, plus somewhere to keep the coordinate between
   * steps. Owning both halves means the whole feature is ONE new control kind
   * and one branch.
   */
  center?: LatLng | null;
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

  const [address, setAddress] = useState('');
  const [located, setLocated] = useState<LatLng | null>(null);
  const [locatedLabel, setLocatedLabel] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const resolvedKey =
    apiKey ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim() ?? null;

  /* A caller-supplied centre wins over a looked-up one: if something upstream
     already knows where the property is, asking again would be rude and
     slower. */
  const effectiveCenter = center ?? located;

  const lookUp = useCallback(async () => {
    const query = address.trim();
    if (query.length < 5) {
      setLookupError('Include the street and the town.');
      return;
    }
    setLookupBusy(true);
    setLookupError(null);
    try {
      const res = await geocodeAddressAction(query);
      if (res.ok) {
        setLocated(res.point);
        setLocatedLabel(res.formattedAddress);
        /* An APPROXIMATE match is often the centre of a postcode rather than a
           house, which frames a satellite view of roughly the right
           neighbourhood and definitely the wrong roof. Said plainly rather than
           hidden, because the person can see whether it is their house. */
        if (res.precision === 'approximate') {
          setLookupError('That is the closest I could get. Check the view is your property.');
        }
        /* Corners from a previous address would be measured against a frame
           that no longer exists. */
        setPoints([]);
        onMeasure({ linearFt: 0, areaSqft: 0, confidence: 0 });
      } else {
        setLocated(null);
        setLocatedLabel(null);
        setLookupError(res.message);
      }
    } catch {
      setLookupError('Address lookup failed. You can enter the size instead.');
    } finally {
      setLookupBusy(false);
    }
  }, [address, onMeasure]);

  const frame = useMemo<MapFrame | null>(() => {
    if (!effectiveCenter) return null;
    return {
      center: effectiveCenter,
      zoom: DEFAULT_ZOOM,
      widthPx: REQUEST_SIZE,
      heightPx: REQUEST_SIZE,
      /* Density only. It does not change what the frame covers, and the
         projection divides it out. */
      scale: 2,
    };
  }, [effectiveCenter]);

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

  /* No key means the feature is switched off. Silent, because the flow has two
     working measurement routes without it and an error about a missing
     environment variable is not a homeowner's problem. */
  if (!resolvedKey) return null;

  /* Key but no location yet: ask for the address. This is the normal first
     render, not an error state. */
  if (!frame) {
    return (
      <div className="ptm">
        <p className="ptm-label">Find your property</p>
        <div className="ptm-lookup">
          <input
            className="ptm-input"
            type="text"
            inputMode="text"
            autoComplete="street-address"
            placeholder="Street address, town"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void lookUp();
            }}
          />
          <button
            type="button"
            className="ptm-btn"
            onClick={() => void lookUp()}
            disabled={lookupBusy}
          >
            {lookupBusy ? 'Looking…' : 'Find'}
          </button>
        </div>
        {lookupError ? <p className="ptm-warn">{lookupError}</p> : null}
      </div>
    );
  }

  const measurement = measureFromTaps(points, { closed });
  const markers = points.map((p) => latLngToTap(frame, p));

  return (
    <div className="ptm">
      <p className="ptm-label">{label}</p>
      {locatedLabel ? <p className="ptm-warn">{locatedLabel}</p> : null}
      {lookupError ? <p className="ptm-warn">{lookupError}</p> : null}

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
