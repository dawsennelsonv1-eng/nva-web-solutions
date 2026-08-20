/**
 * lib/measure/mercator.ts — from a tap on a picture to a point on the earth.
 *
 * ============================================================================
 * WHY A STATIC IMAGE AND NOT THE MAPS JAVASCRIPT SDK
 * ============================================================================
 *
 * The obvious way to let somebody tap their property line is to embed an
 * interactive Google map and read click events off it. It was not chosen, for
 * three reasons that all point the same way:
 *
 *   IT CAN BE TESTED. The SDK's projection lives inside a library that only
 *   exists in a browser with a valid key. This file is closed-form arithmetic
 *   with no dependency on anything, so it can be proven offline — and it has
 *   been, by round-tripping coordinates through pixels and back.
 *
 *   IT IS ONE REQUEST. A static map is a single image URL. The SDK is a
 *   script, a tile stream, and a map instance to keep alive on a phone that is
 *   also holding a photograph and a render in memory.
 *
 *   IT DEGRADES HONESTLY. Without a key the image simply does not load, and the
 *   tool falls back to the photo estimate and manual entry. A half-initialised
 *   SDK fails in stranger ways.
 *
 * WHAT IS GIVEN UP: pan and zoom. The homeowner gets one framed view of their
 * property and taps on it. For a residential lot at zoom 19 or 20 that frame
 * holds the whole property, so the loss is small — and if it turns out to
 * matter, re-centring is another URL rather than a rewrite.
 *
 * ============================================================================
 * THE PROJECTION
 * ============================================================================
 *
 * Google's static maps, tiles and SDK all use Web Mercator (EPSG:3857) on a
 * 256-pixel world at zoom 0, doubling each level. The formulae below are that
 * definition, nothing more:
 *
 *   x = (lng + 180) / 360 * worldSize
 *   y = (1 - ln(tan(lat) + sec(lat)) / PI) / 2 * worldSize
 *
 * MERCATOR IS A SPHERICAL PROJECTION and so is lib/measure/geo.ts, which
 * consumes its output. That consistency is worth stating: both models make the
 * same simplification, so converting a tap to a coordinate and then measuring
 * between coordinates does not mix two different earths.
 *
 * SCALE IS NOT ZOOM. Google's `scale=2` parameter returns the same geographic
 * frame at twice the pixel density for a sharper image on a phone. It changes
 * how many pixels the image has and not what they cover, so it divides out of
 * every conversion here. Getting that wrong halves or doubles every
 * measurement, which is why it is a named parameter rather than a constant.
 */

import type { LatLng } from '@/lib/measure/geo';

/** How the static image was requested. Everything here depends on it. */
export interface MapFrame {
  /** The `center` parameter that was sent to the API. */
  center: LatLng;
  /** The `zoom` parameter. 19-20 suits a residential lot. */
  zoom: number;
  /** The `size` parameter, in CSS pixels before `scale`. */
  widthPx: number;
  heightPx: number;
  /** The `scale` parameter: 1 or 2. Density only, not coverage. */
  scale: number;
}

const TILE_SIZE = 256;
const MAX_LAT = 85.05112878; // where Mercator diverges

const clampLat = (lat: number): number => Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));

function worldSize(zoom: number): number {
  return TILE_SIZE * Math.pow(2, zoom);
}

/** Absolute world-pixel coordinates at a given zoom. */
function project(point: LatLng, zoom: number): { x: number; y: number } {
  const size = worldSize(zoom);
  const lat = clampLat(point.lat);
  const sinLat = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((point.lng + 180) / 360) * size,
    // The log form of the Mercator y, written with the standard numerical
    // guard: (1+sin)/(1-sin) is stable where tan+sec is not near the poles.
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * size,
  };
}

function unproject(x: number, y: number, zoom: number): LatLng {
  const size = worldSize(zoom);
  const lng = (x / size) * 360 - 180;
  const n = Math.PI * (1 - (2 * y) / size);
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lat, lng };
}

/**
 * A tap, in CSS pixels from the top-left of the displayed image, to a
 * coordinate.
 *
 * TAKE THE OFFSET FROM getBoundingClientRect AND THE SIZE FROM THE SAME RECT,
 * not from the frame's requested size. The image is displayed at whatever width
 * the layout gives it, which on a phone is rarely the width that was requested
 * — so the caller must normalise the tap against the DISPLAYED box, and this
 * function takes the frame's logical size to do the geography. Mixing the two
 * is the one mistake that makes every measurement wrong by a constant factor.
 */
export function tapToLatLng(
  frame: MapFrame,
  tap: { xFraction: number; yFraction: number }
): LatLng {
  const centrePx = project(frame.center, frame.zoom);

  // Offset in logical pixels from the image centre. `scale` is absent by
  // design: it changes pixel density, not coverage.
  const dx = (tap.xFraction - 0.5) * frame.widthPx;
  const dy = (tap.yFraction - 0.5) * frame.heightPx;

  return unproject(centrePx.x + dx, centrePx.y + dy, frame.zoom);
}

/** The inverse: where a coordinate falls on the image, as fractions of it. */
export function latLngToTap(
  frame: MapFrame,
  point: LatLng
): { xFraction: number; yFraction: number } {
  const centrePx = project(frame.center, frame.zoom);
  const px = project(point, frame.zoom);
  return {
    xFraction: (px.x - centrePx.x) / frame.widthPx + 0.5,
    yFraction: (px.y - centrePx.y) / frame.heightPx + 0.5,
  };
}

/** Ground distance one logical pixel covers, in feet. Useful for a scale bar. */
export function feetPerPixel(frame: MapFrame): number {
  const metresPerPixel =
    (156543.03392 * Math.cos((clampLat(frame.center.lat) * Math.PI) / 180)) /
    Math.pow(2, frame.zoom);
  return metresPerPixel * 3.280839895013123;
}

/**
 * The static map URL.
 *
 * THE KEY IS A PARAMETER RATHER THAN READ FROM process.env HERE, because this
 * module is imported by a client component and a key read at module scope in
 * client code is a key in the bundle. The caller passes a value that the server
 * decided to expose; this file never decides that.
 *
 * A Maps static key is browser-visible by nature — it travels in the image URL
 * — so it must be restricted by HTTP referrer in the Cloud console. That is not
 * optional: an unrestricted key in a public image URL is somebody else's map
 * quota billed to this account.
 */
export function staticMapUrl(frame: MapFrame, apiKey: string): string {
  const params = new URLSearchParams({
    center: frame.center.lat.toFixed(7) + ',' + frame.center.lng.toFixed(7),
    zoom: String(frame.zoom),
    size: frame.widthPx + 'x' + frame.heightPx,
    scale: String(frame.scale),
    maptype: 'satellite',
    format: 'jpg',
    key: apiKey,
  });
  return 'https://maps.googleapis.com/maps/api/staticmap?' + params.toString();
}
