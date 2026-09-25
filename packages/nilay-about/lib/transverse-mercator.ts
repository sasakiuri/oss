/**
 * Gauss–Krüger (transverse Mercator) on GRS80, both ways, by the series the Geospatial Information
 * Authority of Japan publishes for plane rectangular coordinates (Kawase 2011, 「平面直角座標への換算」
 * and 「緯度、経度への換算」). The same series gives UTM with its own scale and false origin.
 *
 * GRS80 is the ellipsoid of the Japanese geodetic datum. GPS positions are on WGS84, which differs
 * negligibly here.
 */

import type { GeoPoint } from './geodesy';

const GRS80 = { a: 6378137, inverseFlattening: 298.257222101 } as const;
const degrees = Math.PI / 180;
const n = 1 / (2 * GRS80.inverseFlattening - 1);

const alpha = [
  n / 2 - (2 / 3) * n ** 2 + (5 / 16) * n ** 3 + (41 / 180) * n ** 4 - (127 / 288) * n ** 5,
  (13 / 48) * n ** 2 - (3 / 5) * n ** 3 + (557 / 1440) * n ** 4 + (281 / 630) * n ** 5,
  (61 / 240) * n ** 3 - (103 / 140) * n ** 4 + (15061 / 26880) * n ** 5,
  (49561 / 161280) * n ** 4 - (179 / 168) * n ** 5,
  (34729 / 80640) * n ** 5,
];
const beta = [
  n / 2 - (2 / 3) * n ** 2 + (37 / 96) * n ** 3 - (1 / 360) * n ** 4 - (81 / 512) * n ** 5,
  (1 / 48) * n ** 2 + (1 / 15) * n ** 3 - (437 / 1440) * n ** 4 + (46 / 105) * n ** 5,
  (17 / 480) * n ** 3 - (37 / 840) * n ** 4 - (209 / 4480) * n ** 5,
  (4397 / 161280) * n ** 4 - (11 / 504) * n ** 5,
  (4583 / 161280) * n ** 5,
];
const delta = [
  2 * n - (2 / 3) * n ** 2 - 2 * n ** 3 + (116 / 45) * n ** 4 + (26 / 45) * n ** 5 - (2854 / 675) * n ** 6,
  (7 / 3) * n ** 2 - (8 / 5) * n ** 3 - (227 / 45) * n ** 4 + (2704 / 315) * n ** 5 + (2323 / 945) * n ** 6,
  (56 / 15) * n ** 3 - (136 / 35) * n ** 4 - (1262 / 105) * n ** 5 + (73814 / 2835) * n ** 6,
  (4279 / 630) * n ** 4 - (332 / 35) * n ** 5 - (399572 / 14175) * n ** 6,
  (4174 / 315) * n ** 5 - (144838 / 6237) * n ** 6,
  (601676 / 22275) * n ** 6,
];
const A0 = 1 + n ** 2 / 4 + n ** 4 / 64;
// A1 to A5, in order.
const A = [
  -1.5 * (n - n ** 3 / 8 - n ** 5 / 64),
  (15 / 16) * (n ** 2 - n ** 4 / 4),
  (-35 / 48) * (n ** 3 - (5 / 16) * n ** 5),
  (315 / 512) * n ** 4,
  (-693 / 1280) * n ** 5,
];

/** Ā and the meridian arc from the equator to the origin's latitude, both scaled. */
function meridian(originLatitude: number, scale: number) {
  const phi0 = originLatitude * degrees;
  const factor = (scale * GRS80.a) / (1 + n);
  let arc = factor * A0 * phi0;
  A.forEach((coefficient, index) => {
    arc += factor * coefficient * Math.sin(2 * (index + 1) * phi0);
  });
  return { Abar: factor * A0, arc };
}

/**
 * Returns the survey convention: `x` northward and `y` eastward, in metres from the origin, with
 * `scale` the scale factor on the central meridian.
 */
export function transverseMercator(point: GeoPoint, origin: GeoPoint, scale = 1): { x: number; y: number } {
  const { Abar, arc } = meridian(origin.latitude, scale);
  const phi = point.latitude * degrees;
  const lambda = (point.longitude - origin.longitude) * degrees;
  const k = (2 * Math.sqrt(n)) / (1 + n);
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - k * Math.atanh(k * Math.sin(phi)));
  const tbar = Math.sqrt(1 + t * t);
  const xi = Math.atan2(t, Math.cos(lambda));
  const eta = Math.atanh(Math.sin(lambda) / tbar);
  let x = xi;
  let y = eta;
  alpha.forEach((coefficient, index) => {
    const j = index + 1;
    x += coefficient * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    y += coefficient * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  });
  return { x: Abar * x - arc, y: Abar * y };
}

/** The inverse of `transverseMercator`: `x` north and `y` east from the origin, back to latitude and longitude. */
export function inverseTransverseMercator(plane: { x: number; y: number }, origin: GeoPoint, scale = 1): GeoPoint {
  const { Abar, arc } = meridian(origin.latitude, scale);
  const xi = (plane.x + arc) / Abar;
  const eta = plane.y / Abar;
  let xiPrime = xi;
  let etaPrime = eta;
  beta.forEach((coefficient, index) => {
    const j = index + 1;
    xiPrime -= coefficient * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etaPrime -= coefficient * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  });
  const chi = Math.asin(Math.sin(xiPrime) / Math.cosh(etaPrime));
  let phi = chi;
  delta.forEach((coefficient, index) => {
    phi += coefficient * Math.sin(2 * (index + 1) * chi);
  });
  return {
    latitude: phi / degrees,
    longitude: origin.longitude + Math.atan2(Math.sinh(etaPrime), Math.cos(xiPrime)) / degrees,
  };
}
