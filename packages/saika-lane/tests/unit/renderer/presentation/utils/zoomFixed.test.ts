// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { ZOOM_LIMITS } from '@/renderer/presentation/utils/zoomConstants';
import { calculateFixedZoom } from '@/renderer/presentation/utils/zoomFixed';

const standardRadii = {
  1: 45.0,
  4: 30.0,
  6: 20.0,
  8: 10.0,
  10: 0.5,
};

describe('calculateFixedZoom', () => {
  it('canvasRadius parameter affects the zoom factor', () => {
    // FULL mode (score 1 = 45mm) is less likely to be clamped
    const zoom200 = calculateFixedZoom('FULL', 'AIR_RIFLE_10M', standardRadii, 200);
    const zoom400 = calculateFixedZoom('FULL', 'AIR_RIFLE_10M', standardRadii, 400);
    // When canvasRadius is doubled, zoom is also doubled
    expect(zoom400).toBeCloseTo(zoom200 * 2, 1);
  });

  it('uses default 400 when canvasRadius is omitted', () => {
    const withDefault = calculateFixedZoom('RING_6', 'AIR_RIFLE_10M', standardRadii);
    const withExplicit = calculateFixedZoom('RING_6', 'AIR_RIFLE_10M', standardRadii, 400);
    expect(withDefault).toBe(withExplicit);
  });

  it('FULL mode is based on the 1-ring (entire target)', () => {
    const zoom = calculateFixedZoom('FULL', 'AIR_RIFLE_10M', standardRadii, 400);
    // 400 / (45.0 * 1.1) / 5 = 1.616...
    expect(zoom).toBeCloseTo(1.62, 1);
  });

  it('clamps to MIN or above even for very large radii', () => {
    const hugeRadii = { ...standardRadii, 8: 100000 };
    const zoom = calculateFixedZoom('RING_8', 'AIR_RIFLE_10M', hugeRadii, 400);
    expect(zoom).toBe(ZOOM_LIMITS.MIN);
  });

  it('clamps to MAX or below even for very small radii', () => {
    const tinyRadii = { ...standardRadii, 6: 0.001 };
    const zoom = calculateFixedZoom('RING_6', 'AIR_RIFLE_10M', tinyRadii, 400);
    expect(zoom).toBe(ZOOM_LIMITS.MAX);
  });

  it('falls back to initial zoom for all disciplines', () => {
    const emptyRadii = {};
    expect(calculateFixedZoom('RING_4', 'AIR_RIFLE_10M', emptyRadii)).toBe(3.0);
    expect(calculateFixedZoom('RING_4', 'AIR_PISTOL_10M', emptyRadii)).toBe(3.0);
    expect(calculateFixedZoom('RING_4', 'RIFLE_50M', emptyRadii)).toBe(2.0);
    expect(calculateFixedZoom('RING_4', 'PISTOL_25M', emptyRadii)).toBe(1.5);
    expect(calculateFixedZoom('RING_4', 'BEAM_RIFLE_10M', emptyRadii)).toBe(5.0);
  });
});
