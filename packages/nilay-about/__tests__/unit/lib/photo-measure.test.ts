import { describe, expect, it } from 'vitest';

import {
  estimateBoarWeight,
  measurePathCm,
  polylineLength,
  principalExtent,
  scaleCmPerPixel,
} from '@/lib/photo-measure';

describe('lengths on a photo', () => {
  it('adds up the segments of a traced path', () => {
    expect(
      polylineLength([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 3, y: 10 },
      ]),
    ).toBe(11);
    expect(polylineLength([{ x: 0, y: 0 }])).toBeNaN();
    expect(
      polylineLength([
        { x: 0, y: 0 },
        { x: Number.NaN, y: 1 },
      ]),
    ).toBeNaN();
  });
  it('scales a path by a reference of known length', () => {
    // A 30 cm ruler spanning 600 px makes one pixel half a millimetre.
    const scale = scaleCmPerPixel({ x: 100, y: 100 }, { x: 700, y: 100 }, 30);
    expect(scale).toBeCloseTo(0.05, 12);
    expect(
      measurePathCm(
        [
          { x: 0, y: 0 },
          { x: 2000, y: 0 },
        ],
        scale,
      ),
    ).toBeCloseTo(100, 10);
  });
  it('gives nothing without a usable reference or path', () => {
    expect(scaleCmPerPixel({ x: 1, y: 1 }, { x: 1, y: 1 }, 30)).toBeNull();
    expect(scaleCmPerPixel({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toBeNull();
    expect(
      measurePathCm(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        null,
      ),
    ).toBeNull();
    expect(measurePathCm([{ x: 0, y: 0 }], 0.1)).toBeNull();
  });
});

describe('long axis of an outline', () => {
  it('finds the length of a horizontal bar', () => {
    const width = 20;
    const height = 10;
    const mask = new Uint8Array(width * height);
    for (let x = 2; x <= 17; x += 1) for (let y = 4; y <= 5; y += 1) mask[y * width + x] = 1;
    const extent = principalExtent(mask, width, height)!;
    expect(extent.lengthPx).toBeCloseTo(15, 10);
    expect(Math.min(extent.start.x, extent.end.x)).toBeCloseTo(2, 10);
    expect(Math.max(extent.start.x, extent.end.x)).toBeCloseTo(17, 10);
  });
  it('follows a diagonal bar', () => {
    const size = 30;
    const mask = new Uint8Array(size * size);
    for (let i = 5; i <= 25; i += 1) mask[i * size + i] = 1;
    expect(principalExtent(mask, size, size)!.lengthPx).toBeCloseTo(20 * Math.SQRT2, 6);
  });
  it('refuses an empty or mis-sized mask', () => {
    expect(principalExtent(new Uint8Array(100), 10, 10)).toBeNull();
    expect(principalExtent(new Uint8Array(10), 10, 10)).toBeNull();
  });
});

describe('wild boar weight from head and body length (Abe 1986)', () => {
  it('follows the published regressions', () => {
    // log W = 3.38 log L - 5.34 for males and 3.35 log L - 5.30 for females.
    expect(estimateBoarWeight(106, 'male')!.kg).toBeCloseTo(10 ** (3.38 * Math.log10(106) - 5.34), 10);
    expect(estimateBoarWeight(106, 'male')!.kg).toBeCloseTo(32.0, 1);
    expect(estimateBoarWeight(99.2, 'female')!.kg).toBeCloseTo(10 ** (3.35 * Math.log10(99.2) - 5.3), 10);
  });
  it('gives one standard error either side on the log scale', () => {
    const estimate = estimateBoarWeight(120, 'female')!;
    expect(estimate.highKg / estimate.kg).toBeCloseTo(10 ** 0.05, 10);
    expect(estimate.kg / estimate.lowKg).toBeCloseTo(10 ** 0.05, 10);
  });
  it('gives nothing outside the lengths the paper measured', () => {
    expect(estimateBoarWeight(59.9, 'male')).toBeNull();
    expect(estimateBoarWeight(151, 'male')).not.toBeNull();
    expect(estimateBoarWeight(140, 'female')).toBeNull();
    expect(estimateBoarWeight(Number.NaN, 'male')).toBeNull();
  });
});
