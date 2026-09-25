/**
 * Distances, bearings and destinations on the ellipsoid, for the tools that draw on a map.
 *
 * Vincenty's formulae on GRS80 (T. Vincenty, "Direct and inverse solutions of geodesics on the
 * ellipsoid with application of nested equations", Survey Review 23(176), 1975). GPS positions are
 * on WGS84, which differs from GRS80 by far less than any position a phone reports.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const a = 6378137;
const f = 1 / 298.257222101;
const b = a * (1 - f);
const degrees = Math.PI / 180;
const maxIterations = 200;
const tolerance = 1e-12;

export interface Geodesic {
  distanceMetres: number;
  /** Degrees clockwise from true north at the start, 0 to 360. */
  initialBearing: number;
  /** Degrees clockwise from true north on arrival. */
  finalBearing: number;
}

const normaliseBearing = (bearing: number) => ((bearing % 360) + 360) % 360;

/**
 * The shortest path between two points. Returns null when the iteration does not settle, which
 * happens only for points nearly opposite each other on the globe: never between two places in
 * one hunting ground.
 */
export function inverseGeodesic(from: GeoPoint, to: GeoPoint): Geodesic | null {
  const L = (to.longitude - from.longitude) * degrees;
  const U1 = Math.atan((1 - f) * Math.tan(from.latitude * degrees));
  const U2 = Math.atan((1 - f) * Math.tan(to.latitude * degrees));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);
  let lambda = L;
  let sinSigma = 0;
  let cosSigma = 1;
  let sigma = 0;
  let cosSqAlpha = 1;
  let cos2SigmaM = 0;
  let sinLambda = 0;
  let cosLambda = 1;
  for (let iteration = 0; ; iteration += 1) {
    if (iteration >= maxIterations) return null;
    sinLambda = Math.sin(lambda);
    cosLambda = Math.cos(lambda);
    sinSigma = Math.hypot(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda);
    if (sinSigma === 0) return { distanceMetres: 0, initialBearing: 0, finalBearing: 0 };
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    // On the equator cos²α is zero and the term drops out.
    cos2SigmaM = cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;
    const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    const previous = lambda;
    lambda =
      L +
      (1 - C) *
        f *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (Math.abs(lambda - previous) < tolerance) break;
  }
  const uSq = (cosSqAlpha * (a * a - b * b)) / (b * b);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  return {
    distanceMetres: b * A * (sigma - deltaSigma),
    initialBearing: normaliseBearing(
      Math.atan2(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) / degrees,
    ),
    finalBearing: normaliseBearing(Math.atan2(cosU1 * sinLambda, -sinU1 * cosU2 + cosU1 * sinU2 * cosLambda) / degrees),
  };
}

/** Where a path of `distanceMetres` leaving `from` on `bearing` (degrees from true north) ends. */
export function directGeodesic(from: GeoPoint, bearing: number, distanceMetres: number): GeoPoint {
  const alpha1 = bearing * degrees;
  const sinAlpha1 = Math.sin(alpha1);
  const cosAlpha1 = Math.cos(alpha1);
  const tanU1 = (1 - f) * Math.tan(from.latitude * degrees);
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
  const sinU1 = tanU1 * cosU1;
  const sigma1 = Math.atan2(tanU1, cosAlpha1);
  const sinAlpha = cosU1 * sinAlpha1;
  const cosSqAlpha = 1 - sinAlpha * sinAlpha;
  const uSq = (cosSqAlpha * (a * a - b * b)) / (b * b);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  let sigma = distanceMetres / (b * A);
  let cos2SigmaM = 0;
  let sinSigma = 0;
  let cosSigma = 1;
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    cos2SigmaM = Math.cos(2 * sigma1 + sigma);
    sinSigma = Math.sin(sigma);
    cosSigma = Math.cos(sigma);
    const deltaSigma =
      B *
      sinSigma *
      (cos2SigmaM +
        (B / 4) *
          (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
            (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
    const previous = sigma;
    sigma = distanceMetres / (b * A) + deltaSigma;
    if (Math.abs(sigma - previous) < tolerance) break;
  }
  cos2SigmaM = Math.cos(2 * sigma1 + sigma);
  sinSigma = Math.sin(sigma);
  cosSigma = Math.cos(sigma);
  const x = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
  const latitude = Math.atan2(sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1, (1 - f) * Math.hypot(sinAlpha, x));
  const lambda = Math.atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1);
  const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
  const L =
    lambda -
    (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  const longitude = from.longitude + L / degrees;
  return { latitude: latitude / degrees, longitude: ((((longitude + 180) % 360) + 360) % 360) - 180 };
}

/** A circle on the ground as a closed ring of points, for drawing. */
export function circleRing(center: GeoPoint, radiusMetres: number, segments = 72): GeoPoint[] {
  return Array.from({ length: segments }, (_, index) => directGeodesic(center, (360 * index) / segments, radiusMetres));
}

/**
 * An arc of `radiusMetres` from one bearing clockwise to another, at most `stepDegrees` apart.
 * The ends are included, so a sector is the centre followed by this arc.
 */
export function arcPoints(
  center: GeoPoint,
  fromBearing: number,
  toBearing: number,
  radiusMetres: number,
  stepDegrees = 2,
) {
  const sweep = normaliseBearing(toBearing - fromBearing) || (toBearing === fromBearing ? 0 : 360);
  const steps = Math.max(1, Math.ceil(sweep / stepDegrees));
  return Array.from({ length: steps + 1 }, (_, index) =>
    directGeodesic(center, fromBearing + (sweep * index) / steps, radiusMetres),
  );
}

/** The sixteen compass points, for a bearing read out in words. */
const compassPoints = {
  ja: [
    '北',
    '北北東',
    '北東',
    '東北東',
    '東',
    '東南東',
    '南東',
    '南南東',
    '南',
    '南南西',
    '南西',
    '西南西',
    '西',
    '西北西',
    '北西',
    '北北西',
  ],
  en: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'],
} as const;

export function compassPoint(bearing: number, language: 'ja' | 'en'): string {
  return compassPoints[language][Math.round(normaliseBearing(bearing) / 22.5) % 16]!;
}
