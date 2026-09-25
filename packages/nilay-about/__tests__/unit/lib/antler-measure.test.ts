import { describe, expect, it } from 'vitest';

import { centimetresPerPixel, measuredCentimetres, polylineLength } from '@/lib/antler-measure';

describe('antler measuring on a photo', () => {
  it('scales by the reference and follows the traced points', () => {
    // A 30 cm ruler across 600 pixels: 0.05 cm per pixel.
    const scale = centimetresPerPixel({ x: 100, y: 100 }, { x: 700, y: 100 }, 30);
    expect(scale).toBeCloseTo(0.05, 12);
    const beam = [
      { x: 0, y: 0 },
      { x: 300, y: 400 },
      { x: 300, y: 900 },
    ];
    expect(polylineLength(beam)).toBe(1000);
    expect(measuredCentimetres(beam, scale)).toBeCloseTo(50, 10);
  });

  it('gives nothing without a scale or a line', () => {
    expect(centimetresPerPixel({ x: 1, y: 1 }, { x: 1, y: 1 }, 30)).toBeNull();
    expect(centimetresPerPixel({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toBeNull();
    expect(measuredCentimetres([{ x: 0, y: 0 }], 0.1)).toBeNull();
    expect(
      measuredCentimetres(
        [
          { x: 0, y: 0 },
          { x: 3, y: 4 },
        ],
        null,
      ),
    ).toBeNull();
  });
});
