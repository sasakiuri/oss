/**
 * Placing a position on a map image the reader brought.
 *
 * The map is only a picture, so it is tied to the ground by reference points: a spot on the picture
 * and its latitude and longitude. The latitude and longitude are first projected onto a plane in
 * metres, and a plane transform from there to the picture's pixels is fitted by least squares.
 *
 * - With two points only a similarity (scale, rotation and shift) can be fitted.
 * - With three or more an affine transform can take up a picture scaled differently across and
 *   down, or skewed slightly. A similarity can still be chosen, for a map known to be true to shape.
 *
 * A fit with exactly as many points as it needs passes through every point, so its residuals are
 * zero whatever the error. Only an extra point can show how well the picture and the fit agree.
 */

import type { GeoPoint } from './geodesy';
import { inverseTransverseMercator, transverseMercator } from './transverse-mercator';

export type { GeoPoint };

const GRS80_A = 6378137;

export type Projection = 'transverse-mercator' | 'web-mercator';
export type Model = 'affine' | 'similarity';

export interface ImagePoint {
  x: number;
  y: number;
}

/** Metres on a plane: east, and south as a positive `v` so that it runs down the page like pixels do. */
export interface PlanePoint {
  u: number;
  v: number;
}

const degrees = Math.PI / 180;

/**
 * The Mercator of web maps, which treats the latitude as if the earth were a sphere. Scaled by the
 * cosine of the origin's latitude so that, near the origin, a unit is close to a metre on the ground.
 */
export function webMercator(point: GeoPoint, origin: GeoPoint): PlanePoint {
  const scale = GRS80_A * Math.cos(origin.latitude * degrees);
  const isometric = (latitude: number) => Math.atanh(Math.sin(latitude * degrees));
  return {
    u: scale * (point.longitude - origin.longitude) * degrees,
    v: -scale * (isometric(point.latitude) - isometric(origin.latitude)),
  };
}

export function project(point: GeoPoint, origin: GeoPoint, projection: Projection): PlanePoint {
  if (projection === 'web-mercator') return webMercator(point, origin);
  const { x, y } = transverseMercator(point, origin);
  return { u: y, v: -x };
}

/** The inverse of `project`: plane metres back to latitude and longitude. */
export function unproject(plane: PlanePoint, origin: GeoPoint, projection: Projection): GeoPoint {
  if (projection === 'web-mercator') {
    const scale = GRS80_A * Math.cos(origin.latitude * degrees);
    const isometric = Math.atanh(Math.sin(origin.latitude * degrees)) - plane.v / scale;
    return {
      latitude: Math.asin(Math.tanh(isometric)) / degrees,
      longitude: origin.longitude + plane.u / scale / degrees,
    };
  }
  return inverseTransverseMercator({ x: -plane.v, y: plane.u }, origin);
}

/** `x = a·u + b·v + c`, `y = d·u + e·v + f`: plane metres to picture pixels. */
export interface PlaneTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface PlanePair {
  plane: PlanePoint;
  image: ImagePoint;
}

export type PlaneFit = { status: 'ok'; transform: PlaneTransform } | { status: 'coincident' } | { status: 'collinear' };

/** Below this spread, in metres or pixels, points are taken to be one place. */
const minimumSpread = 1;
/**
 * How far from a line three or more points have to lie for an affine fit: 4·det / trace² of their
 * spread, 1 for a round cloud and 0 for a line. 0.01 is a cloud about one twentieth as wide as long.
 */
const minimumRoundness = 0.01;

interface Spread {
  meanA: number;
  meanB: number;
  saa: number;
  sbb: number;
  sab: number;
}

function spread(values: readonly (readonly [number, number])[]): Spread {
  const count = values.length;
  const meanA = values.reduce((sum, [a]) => sum + a, 0) / count;
  const meanB = values.reduce((sum, [, b]) => sum + b, 0) / count;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  for (const [a, b] of values) {
    saa += (a - meanA) ** 2;
    sbb += (b - meanB) ** 2;
    sab += (a - meanA) * (b - meanB);
  }
  return { meanA, meanB, saa, sbb, sab };
}

const rmsSpread = (s: Spread, count: number) => Math.sqrt((s.saa + s.sbb) / count);
const roundness = (s: Spread) => {
  const trace = s.saa + s.sbb;
  return trace > 0 ? (4 * (s.saa * s.sbb - s.sab ** 2)) / trace ** 2 : 0;
};

export const minimumPoints: Record<Model, number> = { similarity: 2, affine: 3 };

/** Least-squares fit from plane metres to pixels. Exported for its tests; the page uses `fitGeoreference`. */
export function fitPlane(pairs: readonly PlanePair[], model: Model): PlaneFit {
  const count = pairs.length;
  if (count < minimumPoints[model]) throw new Error(`A ${model} fit needs at least ${minimumPoints[model]} points.`);
  const plane = spread(pairs.map(({ plane: p }) => [p.u, p.v] as const));
  const image = spread(pairs.map(({ image: p }) => [p.x, p.y] as const));
  if (rmsSpread(plane, count) < minimumSpread || rmsSpread(image, count) < minimumSpread)
    return { status: 'coincident' };

  if (model === 'similarity') {
    // x = a·u − b·v + c, y = b·u + a·v + f: a turn and a scale, never a mirror.
    let dot = 0;
    let cross = 0;
    for (const { plane: p, image: q } of pairs) {
      const u = p.u - plane.meanA;
      const v = p.v - plane.meanB;
      const x = q.x - image.meanA;
      const y = q.y - image.meanB;
      dot += u * x + v * y;
      cross += u * y - v * x;
    }
    const norm = plane.saa + plane.sbb;
    const a = dot / norm;
    const b = cross / norm;
    return {
      status: 'ok',
      transform: {
        a,
        b: -b,
        c: image.meanA - a * plane.meanA + b * plane.meanB,
        d: b,
        e: a,
        f: image.meanB - b * plane.meanA - a * plane.meanB,
      },
    };
  }

  if (roundness(plane) < minimumRoundness || roundness(image) < minimumRoundness) return { status: 'collinear' };
  // Centred normal equations: [Suu Suv; Suv Svv]·[a; b] = [Sux; Svx], and the same for y.
  let sux = 0;
  let svx = 0;
  let suy = 0;
  let svy = 0;
  for (const { plane: p, image: q } of pairs) {
    const u = p.u - plane.meanA;
    const v = p.v - plane.meanB;
    sux += u * (q.x - image.meanA);
    svx += v * (q.x - image.meanA);
    suy += u * (q.y - image.meanB);
    svy += v * (q.y - image.meanB);
  }
  const det = plane.saa * plane.sbb - plane.sab ** 2;
  const a = (plane.sbb * sux - plane.sab * svx) / det;
  const b = (plane.saa * svx - plane.sab * sux) / det;
  const d = (plane.sbb * suy - plane.sab * svy) / det;
  const e = (plane.saa * svy - plane.sab * suy) / det;
  return {
    status: 'ok',
    transform: {
      a,
      b,
      c: image.meanA - a * plane.meanA - b * plane.meanB,
      d,
      e,
      f: image.meanB - d * plane.meanA - e * plane.meanB,
    },
  };
}

export function applyTransform(transform: PlaneTransform, point: PlanePoint): ImagePoint {
  return {
    x: transform.a * point.u + transform.b * point.v + transform.c,
    y: transform.d * point.u + transform.e * point.v + transform.f,
  };
}

/** A displacement in pixels, as metres on the plane. */
function pixelsToMetres(transform: PlaneTransform, dx: number, dy: number): number {
  const det = transform.a * transform.e - transform.b * transform.d;
  const du = (transform.e * dx - transform.b * dy) / det;
  const dv = (transform.a * dy - transform.d * dx) / det;
  return Math.hypot(du, dv);
}

export interface ReferencePair {
  image: ImagePoint;
  geo: GeoPoint;
}

export interface PointResidual {
  /** Where the fit puts this point's latitude and longitude on the picture. */
  predicted: ImagePoint;
  pixels: number;
  metres: number;
}

export type Georeference =
  | { status: 'too-few'; needed: number }
  | { status: 'coincident' }
  | { status: 'collinear' }
  /** A latitude the projection cannot show: the poles in Web Mercator run off to infinity. */
  | { status: 'out-of-range' }
  | {
      status: 'ok';
      model: Model;
      projection: Projection;
      origin: GeoPoint;
      transform: PlaneTransform;
      residuals: PointResidual[];
      rmsMetres: number;
      maxMetres: number;
      /** False while there are only as many points as the fit needs, when every residual is zero by construction. */
      checkable: boolean;
      /** The picture comes out as a mirror image of the ground: most often latitude and longitude swapped. */
      mirrored: boolean;
      /** Pixels per metre on the ground, averaged over the two directions. */
      pixelsPerMetre: number;
    };

/** Two points allow only a similarity; from three the reader's choice holds. */
export function effectiveModel(preferred: Model, count: number): Model {
  return count >= minimumPoints.affine ? preferred : 'similarity';
}

export function fitGeoreference(
  pairs: readonly ReferencePair[],
  preferred: Model,
  projection: Projection,
): Georeference {
  if (pairs.length < minimumPoints.similarity) return { status: 'too-few', needed: minimumPoints.similarity };
  const model = effectiveModel(preferred, pairs.length);
  // The mean of the points keeps the plane's own distortion smallest where the points are.
  const origin = {
    latitude: pairs.reduce((sum, pair) => sum + pair.geo.latitude, 0) / pairs.length,
    longitude: pairs.reduce((sum, pair) => sum + pair.geo.longitude, 0) / pairs.length,
  };
  const planePairs = pairs.map((pair) => ({ plane: project(pair.geo, origin, projection), image: pair.image }));
  if (planePairs.some(({ plane }) => !Number.isFinite(plane.u) || !Number.isFinite(plane.v)))
    return { status: 'out-of-range' };
  const fit = fitPlane(planePairs, model);
  if (fit.status !== 'ok') return fit;
  const { transform } = fit;
  if (!Object.values(transform).every(Number.isFinite)) return { status: 'out-of-range' };
  const residuals = planePairs.map(({ plane, image }) => {
    const predicted = applyTransform(transform, plane);
    const dx = predicted.x - image.x;
    const dy = predicted.y - image.y;
    return { predicted, pixels: Math.hypot(dx, dy), metres: pixelsToMetres(transform, dx, dy) };
  });
  const det = transform.a * transform.e - transform.b * transform.d;
  return {
    status: 'ok',
    model,
    projection,
    origin,
    transform,
    residuals,
    rmsMetres: Math.sqrt(residuals.reduce((sum, r) => sum + r.metres ** 2, 0) / residuals.length),
    maxMetres: Math.max(...residuals.map((r) => r.metres)),
    checkable: pairs.length > minimumPoints[model],
    mirrored: det < 0,
    pixelsPerMetre: Math.sqrt(Math.abs(det)),
  };
}

/** Picture pixels back to plane metres, or null for a transform that flattens the plane to a line. */
export function imageToPlane(transform: PlaneTransform, point: ImagePoint): PlanePoint | null {
  const det = transform.a * transform.e - transform.b * transform.d;
  if (det === 0 || !Number.isFinite(det)) return null;
  const dx = point.x - transform.c;
  const dy = point.y - transform.f;
  return { u: (transform.e * dx - transform.b * dy) / det, v: (transform.a * dy - transform.d * dx) / det };
}

/** Where a pixel of the picture lies on the ground, by the fit. */
export function imageToGeo(georeference: Extract<Georeference, { status: 'ok' }>, point: ImagePoint): GeoPoint | null {
  const plane = imageToPlane(georeference.transform, point);
  return plane ? unproject(plane, georeference.origin, georeference.projection) : null;
}

export function geoToImage(georeference: Extract<Georeference, { status: 'ok' }>, point: GeoPoint): ImagePoint {
  return applyTransform(georeference.transform, project(point, georeference.origin, georeference.projection));
}

export function isInsideImage(point: ImagePoint, size: { width: number; height: number }): boolean {
  return point.x >= 0 && point.y >= 0 && point.x <= size.width && point.y <= size.height;
}

/**
 * Whether a map for the fiscal year `fiscalYear` (April to the next March, as prefectures date their
 * maps: 令和7年度 is 2025) has run out on `today`: from 1 April of the year after.
 */
export function fiscalYearEnded(fiscalYear: number, today: { year: number; month: number }): boolean {
  const current = today.month >= 4 ? today.year : today.year - 1;
  return current > fiscalYear;
}

/** The Japanese era name for a fiscal year: 令和 from 2019, 平成 before. */
export function eraYear(fiscalYear: number): { era: '令和' | '平成'; year: number } {
  return fiscalYear >= 2019 ? { era: '令和', year: fiscalYear - 2018 } : { era: '平成', year: fiscalYear - 1988 };
}

export interface ZoneProximity {
  inside: boolean;
  /** Metres from the position to the nearest edge of the area, in the fitted plane. */
  distanceMetres: number;
}

/**
 * Where a position stands against an area traced on the picture: inside or not, and how far from
 * its edge. Worked in the plane of the fit, whose units are metres on the ground near the reference
 * points, so the answer carries the fit's error as well as the position's.
 */
export function zoneProximity(
  georeference: Extract<Georeference, { status: 'ok' }>,
  zone: readonly ImagePoint[],
  position: GeoPoint,
): ZoneProximity | null {
  if (zone.length < 3) return null;
  const ring = zone.map((point) => imageToPlane(georeference.transform, point));
  if (ring.some((point) => point === null)) return null;
  const vertices = ring as PlanePoint[];
  const here = project(position, georeference.origin, georeference.projection);
  let inside = false;
  let nearest = Infinity;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index, index += 1) {
    const a = vertices[previous]!;
    const b = vertices[index]!;
    if (a.v > here.v !== b.v > here.v && here.u < ((b.u - a.u) * (here.v - a.v)) / (b.v - a.v) + a.u) inside = !inside;
    const du = b.u - a.u;
    const dv = b.v - a.v;
    const length = du * du + dv * dv;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((here.u - a.u) * du + (here.v - a.v) * dv) / length));
    nearest = Math.min(nearest, Math.hypot(here.u - (a.u + t * du), here.v - (a.v + t * dv)));
  }
  return { inside, distanceMetres: nearest };
}

/**
 * Reads a latitude or longitude as typed from the edge of a map: decimal degrees, or degrees,
 * minutes and seconds written with °′″, with 度分秒, with colons or with spaces. A hemisphere may be
 * given as N/S/E/W or 北緯/南緯/東経/西経; south and west, or a leading minus, make it negative.
 * Returns null for anything that is not one clear angle within range.
 */
export function parseCoordinate(text: string, kind: 'latitude' | 'longitude'): number | null {
  let rest = text.normalize('NFKC').trim().toUpperCase();
  if (rest === '') return null;
  let sign = 1;
  const hemispheres = kind === 'latitude' ? { N: 1, S: -1, 北緯: 1, 南緯: -1 } : { E: 1, W: -1, 東経: 1, 西経: -1 };
  let hemisphereSeen = false;
  for (const [mark, value] of Object.entries(hemispheres)) {
    if (rest.startsWith(mark) || rest.endsWith(mark)) {
      if (hemisphereSeen) return null;
      hemisphereSeen = true;
      sign = value;
      rest = (rest.startsWith(mark) ? rest.slice(mark.length) : rest.slice(0, -mark.length)).trim();
    }
  }
  if (rest.startsWith('-') || rest.startsWith('−')) {
    if (hemisphereSeen) return null;
    sign = -1;
    rest = rest.slice(1).trim();
  }
  // Every separator becomes a space; what is left has to be one to three plain numbers.
  const parts = rest
    .replace(/[°度'′’分"″”秒:]/g, ' ')
    .trim()
    .split(/\s+/);
  if (parts.length < 1 || parts.length > 3 || !parts.every((part) => /^\d+(\.\d+)?$/.test(part))) return null;
  const [whole = NaN, minutes = 0, seconds = 0] = parts.map(Number);
  // Only the last part may carry a fraction: 35.5 12 is not an angle.
  if (parts.slice(0, -1).some((part) => part.includes('.'))) return null;
  if (minutes >= 60 || seconds >= 60) return null;
  const value = sign * (whole + minutes / 60 + seconds / 3600);
  const limit = kind === 'latitude' ? 90 : 180;
  return Math.abs(value) <= limit ? value : null;
}
