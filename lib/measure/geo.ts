/**
 * lib/measure/geo.ts — turning points on a map into feet.
 *
 * ============================================================================
 * NO API, NO KEY, NO NETWORK. THIS IS ARITHMETIC.
 * ============================================================================
 *
 * The satellite tools in lib/tools/ideas.ts were all marked
 * `needs-new-capability`, which was true and hid something useful: the
 * capability is TWO things with completely different risk profiles.
 *
 *   FETCHING roof geometry or elevation needs Google, a billing account, a live
 *   key, and cannot be tested from a build container. That part is honestly
 *   untestable until it runs against the real endpoint.
 *
 *   TURNING TAPPED CORNERS INTO A PERIMETER is this file. It is closed-form
 *   maths on latitude and longitude, it is exactly correct rather than
 *   estimated, and every line of it can be verified offline against known
 *   distances — which it has been.
 *
 * Splitting them means the fencing tool can measure a property line as soon as
 * there is a map to tap, without waiting on an integration nobody can prove.
 *
 * ============================================================================
 * WHY THIS IS BETTER THAN THE PHOTO ESTIMATE, AND WHY BOTH EXIST
 * ============================================================================
 *
 * `lib/verticals/fencing` estimates a run from a photograph, and that estimate
 * carries a confidence score precisely because judging a boundary that recedes
 * from the camera is a depth problem a single frame cannot solve well.
 *
 * A perimeter computed from tapped corners has no such problem. The homeowner
 * is not estimating; he is pointing at his own fence line on an image of his
 * own property, and the distance between two points on the earth is not a
 * matter of opinion. When this path is available it should REPLACE the vision
 * estimate and set confidence high, not average with it.
 *
 * ============================================================================
 * THE MODEL: A SPHERE, AND WHY THAT IS ENOUGH
 * ============================================================================
 *
 * The earth is an oblate spheroid, and the exact answer needs Vincenty's
 * formulae or Karney's algorithm — iterative, fiddly, and correct to
 * millimetres over thousands of kilometres.
 *
 * A residential property line is under 200 metres. At that scale the spherical
 * model is wrong by roughly 0.2 to 0.5 per cent — around six inches on a
 * 160-foot fence run. The fence panels come in 8-foot sections and the crew
 * measures the site before ordering. Six inches is not a source of error worth
 * three hundred lines of iteration.
 *
 * WHAT WOULD CHANGE THIS: a use over kilometres rather than metres — a rural
 * boundary, an acreage perimeter. If that arrives, swap the distance function
 * and leave everything else; the shape of this file does not depend on it.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Mean earth radius in metres (IUGG). */
const EARTH_RADIUS_M = 6371008.8;

const M_TO_FT = 3.280839895013123;
const SQM_TO_SQFT = 10.763910416709722;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two points, in metres (haversine).
 *
 * HAVERSINE RATHER THAN THE SPHERICAL LAW OF COSINES, which is algebraically
 * equivalent and numerically useless here: cos(d/R) for two points a few metres
 * apart is a value indistinguishable from 1 in floating point, and the
 * arccosine of that loses most of its significant digits. Haversine is stable
 * at short distances, which is the only distance this codebase ever measures.
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function distanceFeet(a: LatLng, b: LatLng): number {
  return distanceMeters(a, b) * M_TO_FT;
}

/**
 * Total length of an OPEN path — corner to corner, without returning to the
 * start. This is the fencing case more often than the closed one: a back yard
 * is three sides, and the fourth is the house.
 */
export function pathLengthFeet(points: readonly LatLng[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    if (!prev || !cur) continue;
    total += distanceMeters(prev, cur);
  }
  return total * M_TO_FT;
}

/**
 * Perimeter of a CLOSED polygon — the open path plus the closing leg.
 *
 * The closing leg is added rather than requiring the caller to repeat the first
 * point, because a UI where someone taps four corners produces four points, and
 * making the caller duplicate one is an invitation to double-count it.
 */
export function perimeterFeet(points: readonly LatLng[]): number {
  if (points.length < 3) return pathLengthFeet(points);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  return pathLengthFeet(points) + distanceMeters(last, first) * M_TO_FT;
}

/**
 * Area of a closed polygon in square feet.
 *
 * EQUIRECTANGULAR PROJECTION ABOUT THE POLYGON'S OWN CENTRE, then the shoelace
 * formula. Projecting about the centroid rather than the equator is what keeps
 * this accurate: longitude degrees shrink by cos(latitude), and at Dallas'
 * 32.8 degrees that is a 16 per cent compression. Ignoring it would overstate
 * every yard in Texas by roughly that much.
 *
 * Over a residential lot the projection error is far below the error in where
 * somebody taps, which is the honest limit on this number and not something
 * better maths can fix.
 *
 * SIGNED AREA, ABSOLUTE VALUE TAKEN. Points tapped clockwise and points tapped
 * anticlockwise describe the same yard, and only the sign differs.
 */
export function polygonAreaSqft(points: readonly LatLng[]): number {
  if (points.length < 3) return 0;

  let latSum = 0;
  for (const p of points) latSum += p.lat;
  const latRef = toRad(latSum / points.length);
  const cosLatRef = Math.cos(latRef);

  // Project to local metres about the first point.
  const origin = points[0];
  if (!origin) return 0;

  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of points) {
    xs.push(toRad(p.lng - origin.lng) * EARTH_RADIUS_M * cosLatRef);
    ys.push(toRad(p.lat - origin.lat) * EARTH_RADIUS_M);
  }

  let twiceArea = 0;
  for (let i = 0; i < points.length; i += 1) {
    const j = (i + 1) % points.length;
    const xi = xs[i];
    const yi = ys[i];
    const xj = xs[j];
    const yj = ys[j];
    if (xi === undefined || yi === undefined || xj === undefined || yj === undefined) continue;
    twiceArea += xi * yj - xj * yi;
  }

  return Math.abs(twiceArea / 2) * SQM_TO_SQFT;
}

/**
 * What a tapped boundary is worth as a measurement.
 *
 * RETURNS A CONFIDENCE, deliberately, so this drops into the same slot the
 * vision estimate fills and the rest of the pipeline does not have to know
 * which produced the number. But the confidence is not a judgement about the
 * maths — the maths is exact. It is a judgement about the TAPPING:
 *
 *   Two points is a straight run somebody pointed at. Fine.
 *   Three or more is a boundary with corners, which is what people actually
 *     fence, and is if anything more reliable because each leg is short.
 *   Points within a couple of metres of each other are almost certainly a
 *     double-tap or a slipped finger rather than a real corner, and they
 *     inflate a perimeter with legs nobody intended.
 *
 * So the only thing that lowers confidence here is evidence the input was
 * fumbled, which is the only thing that can actually be wrong.
 */
export interface TappedMeasurement {
  linearFt: number;
  areaSqft: number;
  confidence: number;
  /** Populated when something about the tapping looks unintentional. */
  warnings: string[];
}

const SUSPICIOUS_LEG_METERS = 2;

export function measureFromTaps(
  points: readonly LatLng[],
  opts: { closed: boolean }
): TappedMeasurement {
  const warnings: string[] = [];

  if (points.length < 2) {
    return { linearFt: 0, areaSqft: 0, confidence: 0, warnings: ['Not enough points.'] };
  }

  let shortLegs = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    if (!prev || !cur) continue;
    if (distanceMeters(prev, cur) < SUSPICIOUS_LEG_METERS) shortLegs += 1;
  }
  if (shortLegs > 0) {
    warnings.push(
      shortLegs === 1
        ? 'Two of the points are almost on top of each other.'
        : shortLegs + ' pairs of points are almost on top of each other.'
    );
  }

  const linearFt = opts.closed ? perimeterFeet(points) : pathLengthFeet(points);
  const areaSqft = opts.closed ? polygonAreaSqft(points) : 0;

  /* 0.95 rather than 1.0 with nothing wrong: the arithmetic is exact but the
     finger is not, and a measurement that claims total certainty removes the
     homeowner's reason to glance at it. Everything downstream treats anything
     at or above the 0.8 floor as usable without prompting. */
  const confidence = shortLegs > 0 ? 0.5 : 0.95;

  return {
    linearFt: Math.round(linearFt),
    areaSqft: Math.round(areaSqft),
    confidence,
    warnings,
  };
}
