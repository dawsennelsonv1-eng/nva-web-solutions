'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { checkIpRateLimit, clientIpFromHeaders } from '@/lib/quote/guards';
import type { LatLng } from '@/lib/measure/geo';

/**
 * app/actions/geocode.ts — an address to a point on the map.
 *
 * ============================================================================
 * WHY THIS EXISTS AND WHY IT IS SO SMALL
 * ============================================================================
 *
 * components/tools/PropertyTapMap.tsx needs a centre coordinate before it can
 * frame anything, and the only thing a homeowner can supply is their address.
 * That is the entire job: one string in, one coordinate out.
 *
 * ============================================================================
 * THE KEY NEVER LEAVES THE SERVER, AND THAT IS THE POINT OF THE ACTION
 * ============================================================================
 *
 * There are two Google keys in play and they must not be confused:
 *
 *   THE STATIC MAPS KEY is browser-visible by nature — it travels inside the
 *   image URL — and is protected by an HTTP referrer restriction.
 *
 *   THE GEOCODING KEY IS NOT. Geocoding is a server-to-server call, referrer
 *   restrictions do not apply to it, and a geocoding key in a client bundle is
 *   an open endpoint on somebody else's card. So the call happens here, the key
 *   is read from a non-public env var, and the browser never sees it.
 *
 * Using one key for both would mean either exposing the geocoder or breaking
 * the map. Two keys, restricted differently, is the only correct arrangement:
 *   GOOGLE_GEOCODING_KEY        server only, IP-restricted if possible
 *   NEXT_PUBLIC_GOOGLE_MAPS_KEY browser, HTTP-referrer restricted
 *
 * ============================================================================
 * IT IS ALLOWED TO NOT WORK
 * ============================================================================
 *
 * No key, a failed lookup, an ambiguous address, a Google outage — every one of
 * them returns `ok: false` with a message a homeowner can act on, and the flow
 * carries on with the photo estimate and manual entry, both of which already
 * work without any of this. Nothing downstream may treat a missing coordinate
 * as an error state.
 *
 * VERIFY: this has never run against the live endpoint. It was written from the
 * documented response shape and parsed strictly, so a shape that does not match
 * fails closed into the fallback rather than into a wrong coordinate. The first
 * real call is the test, and the thing to check is that a Dallas address comes
 * back near 32.7767, -96.7970 rather than in the Gulf of Guinea — which is
 * where every zeroed coordinate on earth ends up.
 */

export interface GeocodeSuccess {
  ok: true;
  point: LatLng;
  /** Google's tidied version of the address, for confirming to the person. */
  formattedAddress: string;
  /**
   * How precisely Google located it. A ROOFTOP match is a house; an
   * APPROXIMATE one may be the centre of a postcode district, which would frame
   * a satellite view of somebody else's street.
   */
  precision: 'rooftop' | 'interpolated' | 'approximate';
}

export interface GeocodeFailure {
  ok: false;
  message: string;
  code: 'not_configured' | 'rate_limited' | 'not_found' | 'ambiguous' | 'provider_error';
}

export type GeocodeResult = GeocodeSuccess | GeocodeFailure;

/**
 * The slice of Google's response this depends on, and nothing more.
 *
 * DELIBERATELY NARROW. Parsing only what is used means a change to any other
 * part of their payload cannot break this, and `.passthrough()` is absent on
 * purpose — unknown keys are ignored rather than carried into the app.
 */
const geocodeResponseSchema = z.object({
  status: z.string(),
  results: z
    .array(
      z.object({
        formatted_address: z.string(),
        geometry: z.object({
          location: z.object({ lat: z.number(), lng: z.number() }),
          location_type: z.string().optional(),
        }),
      })
    )
    .default([]),
});

function precisionOf(locationType: string | undefined): GeocodeSuccess['precision'] {
  if (locationType === 'ROOFTOP') return 'rooftop';
  if (locationType === 'RANGE_INTERPOLATED') return 'interpolated';
  return 'approximate';
}

const ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';
/** Long enough for a slow lookup, short enough not to hold a widget step. */
const TIMEOUT_MS = 8000;

export async function geocodeAddressAction(rawAddress: string): Promise<GeocodeResult> {
  const address = rawAddress.trim();

  if (address.length < 5) {
    return {
      ok: false,
      code: 'not_found',
      message: 'That address looks too short. Include the street and the town.',
    };
  }

  /* Rate limited on the same guard as the render. Geocoding is cheap, but an
     unbounded endpoint that spends money per call is still an unbounded
     endpoint that spends money per call. */
  const ip = clientIpFromHeaders(headers());
  if (ip) {
    const verdict = await checkIpRateLimit(ip);
    if (!verdict.ok) return { ok: false, code: 'rate_limited', message: verdict.message };
  }

  const key = process.env.GOOGLE_GEOCODING_KEY?.trim();
  if (!key) {
    /* Not an error worth showing as a failure of the address. The feature is
       simply not switched on, and the caller falls back silently. */
    return {
      ok: false,
      code: 'not_configured',
      message: 'Address lookup is not available right now. You can enter the size instead.',
    };
  }

  const url =
    ENDPOINT +
    '?' +
    new URLSearchParams({
      address,
      key,
      /* Biased to the US market this sells into. It is a BIAS and not a filter:
         an address elsewhere still resolves, it is just not preferred. */
      region: 'us',
    }).toString();

  let payload: unknown;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        ok: false,
        code: 'provider_error',
        message: 'Could not look that address up just now. Enter the size instead.',
      };
    }
    payload = await res.json();
  } catch {
    return {
      ok: false,
      code: 'provider_error',
      message: 'The address lookup timed out. Enter the size instead.',
    };
  }

  const parsed = geocodeResponseSchema.safeParse(payload);
  if (!parsed.success) {
    /* A response that does not match the schema is treated as an outage rather
       than picked over for whatever can be salvaged. Half-understood
       coordinates would frame a satellite view of the wrong property, which is
       worse than no map at all. */
    return {
      ok: false,
      code: 'provider_error',
      message: 'Could not read the address lookup. Enter the size instead.',
    };
  }

  const body = parsed.data;

  if (body.status === 'ZERO_RESULTS' || body.results.length === 0) {
    return {
      ok: false,
      code: 'not_found',
      message: 'I could not find that address. Check it, or enter the size yourself.',
    };
  }

  if (body.status !== 'OK') {
    /* REQUEST_DENIED and OVER_QUERY_LIMIT both land here, and both are almost
       always a billing account or an API that was never enabled — not anything
       the homeowner did. The message says nothing about the address. */
    return {
      ok: false,
      code: 'provider_error',
      message: 'Address lookup is unavailable right now. Enter the size instead.',
    };
  }

  const first = body.results[0];
  if (!first) {
    return {
      ok: false,
      code: 'not_found',
      message: 'I could not find that address. Check it, or enter the size yourself.',
    };
  }

  /* MORE THAN ONE MATCH IS REPORTED, NOT RESOLVED. Silently taking the first of
     several is how somebody ends up tapping a fence line around a stranger's
     house that shares their street name. The caller should ask. */
  if (body.results.length > 1) {
    return {
      ok: false,
      code: 'ambiguous',
      message:
        'That matches more than one address. Add the postcode or the town and try again.',
    };
  }

  return {
    ok: true,
    point: { lat: first.geometry.location.lat, lng: first.geometry.location.lng },
    formattedAddress: first.formatted_address,
    precision: precisionOf(first.geometry.location_type),
  };
}
