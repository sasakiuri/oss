/**
 * The perspective map between a photograph of a flat sheet and the sheet itself.
 *
 * A camera that is not square to the target shows it foreshortened: a square comes out as a
 * trapezoid and a circle as an oval, so one scale taken from two points is wrong everywhere else
 * on the photo. Four points whose places on the sheet are known settle the whole map, because the
 * image of a plane through a pinhole is a plane projective transform with eight unknowns, and each
 * point gives two equations (Hartley and Zisserman, "Multiple View Geometry", section 4.1).
 *
 * Nothing here corrects lens distortion. A phone's main camera is close to a pinhole at the middle
 * of the frame; toward the corners of a wide-angle shot straight lines bend and the map is off.
 */

export interface PlanePoint {
  x: number;
  y: number;
}

/** A 3 × 3 matrix, row by row, with the last entry scaled to 1. */
export type Homography = readonly [number, number, number, number, number, number, number, number, number];

/** Four points in order. The same order on both sides, and no three of them on one line. */
export type Quad = readonly [PlanePoint, PlanePoint, PlanePoint, PlanePoint];

const isFinitePoint = (point: PlanePoint) => Number.isFinite(point.x) && Number.isFinite(point.y);

/** Twice the signed area of a triangle: zero when the three points lie on one line. */
const cross = (a: PlanePoint, b: PlanePoint, c: PlanePoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/**
 * Whether four points can define a map: every three of them must span a triangle. A marker tapped
 * twice, or four points along one edge of the sheet, would leave the map undetermined.
 *
 * The tolerance is relative to the size of the quad, so it means the same for a photo in pixels and
 * a sheet in millimetres.
 */
export function isUsableQuad(quad: Quad): boolean {
  if (!quad.every(isFinitePoint)) return false;
  const span = Math.max(
    ...quad.flatMap((a, index) => quad.slice(index + 1).map((b) => Math.hypot(b.x - a.x, b.y - a.y))),
  );
  if (!(span > 0)) return false;
  const [a, b, c, d] = quad;
  const triangles = [
    [a, b, c],
    [a, b, d],
    [a, c, d],
    [b, c, d],
  ] as const;
  return triangles.every(([p, q, r]) => Math.abs(cross(p, q, r)) > span * span * 1e-6);
}

/**
 * Solve the square system by Gaussian elimination with partial pivoting. Returns null when the
 * system is singular, which for this use means the points did not define a map.
 */
function solve(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index] as number]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++)
      if (Math.abs(rows[row]?.[column] ?? 0) > Math.abs(rows[pivot]?.[column] ?? 0)) pivot = row;
    const pivotRow = rows[pivot] as number[];
    const lead = pivotRow[column] as number;
    if (!Number.isFinite(lead) || Math.abs(lead) < 1e-12) return null;
    [rows[column], rows[pivot]] = [pivotRow, rows[column] as number[]];
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const current = rows[row] as number[];
      const factor = (current[column] as number) / lead;
      if (factor === 0) continue;
      for (let entry = column; entry <= size; entry++)
        current[entry] = (current[entry] as number) - factor * (pivotRow[entry] as number);
    }
  }
  const solution = rows.map((row, index) => (row[size] as number) / (row[index] as number));
  return solution.every(Number.isFinite) ? solution : null;
}

/**
 * The map that sends each `from` point to the `to` point at the same index.
 *
 * With h33 fixed at 1, each pair gives
 *   u = (h11 x + h12 y + h13) / (h31 x + h32 y + 1)
 *   v = (h21 x + h22 y + h23) / (h31 x + h32 y + 1),
 * which is linear in the other eight entries once the denominator is multiplied out. Four pairs
 * give eight equations and a unique answer. Fixing h33 excludes only maps that send the origin of
 * `from` to infinity, which a photo of a sheet in front of the camera never does.
 */
export function solveHomography(from: Quad, to: Quad): Homography | null {
  if (!isUsableQuad(from) || !isUsableQuad(to)) return null;
  const matrix: number[][] = [];
  const vector: number[] = [];
  from.forEach(({ x, y }, index) => {
    const { x: u, y: v } = to[index] as PlanePoint;
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    vector.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    vector.push(v);
  });
  const solution = solve(matrix, vector);
  if (!solution) return null;
  const [h11, h12, h13, h21, h22, h23, h31, h32] = solution as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return [h11, h12, h13, h21, h22, h23, h31, h32, 1];
}

/** Where a point lands under the map, or null for a point the map sends to infinity. */
export function applyHomography(map: Homography, point: PlanePoint): PlanePoint | null {
  const [h11, h12, h13, h21, h22, h23, h31, h32, h33] = map;
  const w = h31 * point.x + h32 * point.y + h33;
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null;
  const x = (h11 * point.x + h12 * point.y + h13) / w;
  const y = (h21 * point.x + h22 * point.y + h23) / w;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** The map that undoes this one, from the adjugate of the matrix. Null when the matrix is singular. */
export function invertHomography(map: Homography): Homography | null {
  const [a, b, c, d, e, f, g, h, i] = map;
  const co11 = e * i - f * h;
  const co12 = -(d * i - f * g);
  const co13 = d * h - e * g;
  const determinant = a * co11 + b * co12 + c * co13;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-18) return null;
  const inverse = [
    co11,
    -(b * i - c * h),
    b * f - c * e,
    co12,
    a * i - c * g,
    -(a * f - c * d),
    co13,
    -(a * h - b * g),
    a * e - b * d,
  ];
  const last = inverse[8] as number;
  // Scaling does not change a projective map, so the inverse is normalised like any other.
  const scale = Math.abs(last) > 1e-12 ? last : determinant;
  return inverse.map((value) => value / scale) as unknown as Homography;
}

/**
 * How many units of `to` one unit of `from` covers at a point: the square root of the area the map
 * gives an infinitesimal square there. A perspective map stretches one part of the photo more than
 * another, so this is local, and it is what a hole size in millimetres has to be divided by to be
 * looked for in pixels at that place.
 *
 * The area factor is the determinant of the map's Jacobian at the point, which for a plane
 * projective map H with w = h31 x + h32 y + h33 is det(H) / w³ (from differentiating u and v above).
 */
export function localScale(map: Homography, point: PlanePoint): number | null {
  if (!isFinitePoint(point)) return null;
  const [a, b, c, d, e, f, g, h, i] = map;
  const w = g * point.x + h * point.y + i;
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const scale = Math.sqrt(Math.abs(determinant / w ** 3));
  return Number.isFinite(scale) && scale > 0 ? scale : null;
}
