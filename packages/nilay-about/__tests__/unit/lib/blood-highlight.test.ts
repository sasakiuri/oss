import { describe, expect, it } from 'vitest';

import { highlightRed, isReddish, thresholds } from '@/lib/blood-highlight';

describe('picking out red', () => {
  it('marks fresh and dark red but not green, brown leaf litter or grey', () => {
    expect(isReddish(200, 20, 30, 50)).toBe(true);
    expect(isReddish(110, 15, 20, 50)).toBe(true);
    expect(isReddish(40, 160, 50, 50)).toBe(false);
    expect(isReddish(120, 90, 60, 50)).toBe(false);
    expect(isReddish(128, 128, 128, 100)).toBe(false);
  });

  it('widens with sensitivity', () => {
    // An orange-red that only a loose setting takes.
    expect(isReddish(200, 80, 40, 0)).toBe(false);
    expect(isReddish(200, 80, 40, 100)).toBe(true);
    expect(thresholds(0).hueHalfWidth).toBeLessThan(thresholds(100).hueHalfWidth);
    expect(thresholds(0).minSaturation).toBeGreaterThan(thresholds(100).minSaturation);
  });

  it('paints red pixels in the marker colour, greys the rest and reports the share', () => {
    const pixels = new Uint8ClampedArray([200, 20, 30, 255, 40, 160, 50, 255]);
    const share = highlightRed(pixels, { sensitivity: 50, colour: 'cyan' });
    expect(share).toBe(0.5);
    expect([...pixels.slice(0, 4)]).toEqual([0, 229, 255, 255]);
    expect(pixels[4]).toBe(pixels[5]);
    expect(pixels[5]).toBe(pixels[6]);
    expect(pixels[7]).toBe(255);
  });
});
