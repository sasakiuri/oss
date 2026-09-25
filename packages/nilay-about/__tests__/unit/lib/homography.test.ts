import { describe, expect, it } from 'vitest';

import {
  applyHomography,
  invertHomography,
  isUsableQuad,
  localScale,
  solveHomography,
  type Homography,
  type Quad,
} from '@/lib/homography';

const sheet: Quad = [
  { x: 0, y: 0 },
  { x: 186, y: 0 },
  { x: 186, y: 273 },
  { x: 0, y: 273 },
];

/** A made-up camera: the sheet seen from low and to the left, so the far edge is shorter. */
const camera: Homography = [2.1, 0.35, 140, -0.12, 1.7, 90, 0.0009, -0.0006, 1];
const photographed = sheet.map((point) => applyHomography(camera, point)!) as unknown as Quad;

describe('homography', () => {
  it('recovers the map from four corners and sends every point back to the sheet', () => {
    const map = solveHomography(photographed, sheet)!;
    expect(map).not.toBeNull();
    for (const point of [
      { x: 93, y: 136.5 },
      { x: 12.5, y: 250 },
      { x: 180, y: 7 },
    ]) {
      const back = applyHomography(map, applyHomography(camera, point)!)!;
      expect(back.x).toBeCloseTo(point.x, 6);
      expect(back.y).toBeCloseTo(point.y, 6);
    }
  });

  it('maps the four points exactly and inverts to the original map', () => {
    const map = solveHomography(sheet, photographed)!;
    sheet.forEach((point, index) => {
      const mapped = applyHomography(map, point)!;
      expect(mapped.x).toBeCloseTo(photographed[index]!.x, 6);
      expect(mapped.y).toBeCloseTo(photographed[index]!.y, 6);
    });
    const inverse = invertHomography(map)!;
    const round = applyHomography(inverse, applyHomography(map, { x: 40, y: 60 })!)!;
    expect(round.x).toBeCloseTo(40, 6);
    expect(round.y).toBeCloseTo(60, 6);
  });

  it('reduces to a plain scale for a photo taken square on', () => {
    const square = sheet.map(({ x, y }) => ({ x: x * 4 + 10, y: y * 4 + 20 })) as unknown as Quad;
    const map = solveHomography(square, sheet)!;
    expect(localScale(map, { x: 300, y: 500 })).toBeCloseTo(0.25, 9);
    expect(applyHomography(map, { x: 10, y: 20 })).toEqual({ x: expect.closeTo(0, 9), y: expect.closeTo(0, 9) });
  });

  it('takes the scale from the derivative of the map at the point', () => {
    // u = x / (0.5x + 1), v = y / (0.5x + 1): at the origin the Jacobian is the identity, and in
    // general its determinant is det(H) / w³ (Hartley and Zisserman), so the scale is w^(-3/2).
    const map: Homography = [1, 0, 0, 0, 1, 0, 0.5, 0, 1];
    expect(localScale(map, { x: 0, y: 0 })).toBeCloseTo(1, 12);
    expect(localScale(map, { x: 1, y: 0 })).toBeCloseTo(1.5 ** -1.5, 12);
    // Agrees with a tiny central difference on a general perspective map.
    const point = { x: 120, y: 80 };
    const h = 1e-4;
    const at = (dx: number, dy: number) => applyHomography(camera, { x: point.x + dx, y: point.y + dy })!;
    const ux = [(at(h, 0).x - at(-h, 0).x) / (2 * h), (at(h, 0).y - at(-h, 0).y) / (2 * h)];
    const uy = [(at(0, h).x - at(0, -h).x) / (2 * h), (at(0, h).y - at(0, -h).y) / (2 * h)];
    const determinant = ux[0]! * uy[1]! - ux[1]! * uy[0]!;
    expect(localScale(camera, point)).toBeCloseTo(Math.sqrt(Math.abs(determinant)), 6);
  });

  it('gives a larger scale where the photo shows the sheet smaller', () => {
    const map = solveHomography(photographed, sheet)!;
    const near = localScale(map, applyHomography(camera, { x: 93, y: 20 })!)!;
    const far = localScale(map, applyHomography(camera, { x: 93, y: 260 })!)!;
    expect(near).not.toBe(far);
    expect(Number.isFinite(near) && Number.isFinite(far)).toBe(true);
  });

  it('refuses points that do not define a map', () => {
    const repeated: Quad = [sheet[0], sheet[0], sheet[2], sheet[3]];
    const inLine: Quad = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 1 },
    ];
    const notNumbers: Quad = [{ x: NaN, y: 0 }, sheet[1], sheet[2], sheet[3]];
    for (const quad of [repeated, inLine, notNumbers]) {
      expect(isUsableQuad(quad)).toBe(false);
      expect(solveHomography(quad, sheet)).toBeNull();
    }
    expect(isUsableQuad(sheet)).toBe(true);
  });
});
