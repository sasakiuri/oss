// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import {
  calculateAutoZoom,
  calculateEffectiveZoom,
  calculateFixedZoom,
  calculateStandardDeviation,
  getNextZoomMode,
  getPrevZoomMode,
  type ZoomMode,
} from '@/renderer/presentation/utils/zoomCalculator';
import { ZOOM_LIMITS } from '@/renderer/presentation/utils/zoomConstants';

describe('calculateStandardDeviation', () => {
  it('standard deviation is 0 for 0 shots', () => {
    expect(calculateStandardDeviation([])).toBe(0);
  });

  it('standard deviation is 0 for 1 shot (fewer than 2 valid shots)', () => {
    const shots = [{ x: 0, y: 0 }];
    expect(calculateStandardDeviation(shots)).toBe(0);
  });

  it('standard deviation is 0 for multiple shots at the same position (no deviation from mean)', () => {
    const shots = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ];
    // All deviations from mean (5,5) are 0, so standard deviation is also 0
    const result = calculateStandardDeviation(shots);
    expect(result).toBe(0);
  });

  it('standard deviation is 0 for multiple shots at the same position near center', () => {
    const shots = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    expect(calculateStandardDeviation(shots)).toBe(0);
  });

  it('correctly calculates standard deviation for scattered shot group', () => {
    const shots = [
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: -10, y: 0 },
      { x: 0, y: -10 },
    ];
    // Mean (0,0), distance squared for each point = 100, variance = 100, sigma = 10
    const result = calculateStandardDeviation(shots);
    expect(result).toBeCloseTo(10, 1);
  });

  it('calculates deviation from mean even for shot groups far from center', () => {
    // When all shots are clustered near (100, 100)
    const shots = [
      { x: 101, y: 100 },
      { x: 99, y: 100 },
      { x: 100, y: 101 },
      { x: 100, y: 99 },
    ];
    // Mean (100,100), distance squared for each point = 1, variance = 1, sigma = 1
    const result = calculateStandardDeviation(shots);
    expect(result).toBeCloseTo(1, 5);
  });

  it('miss shots (null coordinates) are excluded from the denominator', () => {
    const shotsWithMisses = [
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: -10, y: 0 },
      { x: 0, y: -10 },
      { x: null, y: null },
      { x: null, y: null },
    ];
    const shotsWithoutMisses = [
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: -10, y: 0 },
      { x: 0, y: -10 },
    ];
    // Result should be the same regardless of miss shots
    expect(calculateStandardDeviation(shotsWithMisses)).toBe(calculateStandardDeviation(shotsWithoutMisses));
  });

  it('standard deviation is 0 when only 1 valid shot (rest are misses)', () => {
    const shots = [
      { x: 5, y: 5 },
      { x: null, y: null },
      { x: null, y: null },
    ];
    expect(calculateStandardDeviation(shots)).toBe(0);
  });
});

describe('calculateAutoZoom', () => {
  it('returns discipline-specific initial zoom for 0 shots', () => {
    expect(calculateAutoZoom([], 'BEAM_RIFLE_10M')).toBe(5.0);
    expect(calculateAutoZoom([], 'AIR_RIFLE_10M')).toBe(3.0);
  });

  it('returns discipline-specific initial zoom for 1 shot', () => {
    const shots = [{ x: 0, y: 0 }];
    expect(calculateAutoZoom(shots, 'BEAM_RIFLE_10M')).toBe(5.0);
    expect(calculateAutoZoom(shots, 'AIR_RIFLE_10M')).toBe(3.0);
  });

  it('zooms out enough to keep a first outer-ring shot visible', () => {
    const shots = [{ x: 15.25, y: 0 }];
    const result = calculateAutoZoom(shots, 'AIR_RIFLE_10M', 400);

    // AIR_RIFLE shot edge radius: shot distance 15.25mm + bullet radius 2.25mm.
    expect(result).toBeLessThanOrEqual(400 / ((15.25 + 2.25) * 1.1) / 5);
  });

  it('returns maximum zoom for tight groups (sigma < 0.5mm)', () => {
    const shots = [
      { x: 0, y: 0.1 },
      { x: 0.1, y: 0 },
      { x: -0.1, y: 0 },
    ];
    expect(calculateAutoZoom(shots, 'BEAM_RIFLE_10M')).toBe(10.0);
  });

  it('limits tight-group zoom so outer-ring groups remain visible', () => {
    const shots = [
      { x: 15.25, y: 0 },
      { x: 15.5, y: 0 },
      { x: 15.75, y: 0 },
    ];
    const result = calculateAutoZoom(shots, 'AIR_RIFLE_10M', 400);

    // Without the center-distance constraint this tight group would clamp to MAX zoom.
    expect(result).toBeCloseTo(400 / ((15.75 + 2.25) * 1.1) / 5, 5);
    expect(result).toBeLessThan(ZOOM_LIMITS.MAX);
  });

  it('calculates appropriate zoom for scattered shots', () => {
    const shots = [
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: -10, y: 0 },
      { x: 0, y: -10 },
    ];
    const result = calculateAutoZoom(shots, 'BEAM_RIFLE_10M');
    expect(result).toBeGreaterThan(ZOOM_LIMITS.MIN);
    expect(result).toBeLessThan(ZOOM_LIMITS.MAX);
  });

  it('zoom value is always within MIN to MAX range', () => {
    const shots = Array.from({ length: 100 }, (_, i) => ({
      x: (i - 50) * 10,
      y: (i - 50) * 10,
    }));
    const result = calculateAutoZoom(shots, 'BEAM_RIFLE_10M');
    expect(result).toBeGreaterThanOrEqual(ZOOM_LIMITS.MIN);
    expect(result).toBeLessThanOrEqual(ZOOM_LIMITS.MAX);
  });

  describe('auto zoom with targetRadii specified', () => {
    const airRifleRadii: Record<number, number> = {
      10: 0.25,
      9: 2.75,
      8: 5.25,
      7: 7.75,
      6: 10.25,
      5: 12.75,
      4: 15.25,
      3: 17.75,
      2: 20.25,
      1: 22.75,
    };

    const pistol25mRadii: Record<number, number> = {
      10: 50.0,
      9: 100.0,
      8: 140.0,
      7: 180.0,
      6: 220.0,
      5: 250.0,
      4: 280.0,
      3: 310.0,
      2: 340.0,
      1: 370.0,
    };

    it('returns zoom based on 6-ring zone (middle of black zone) for 0 shots', () => {
      // AIR_RIFLE: 400 / (10.25 * 1.1) / 5 = 7.10
      const result = calculateAutoZoom([], 'AIR_RIFLE_10M', 400, airRifleRadii);
      expect(result).toBeCloseTo(7.1, 1);
    });

    it('returns zoom based on 6-ring zone for 1 shot', () => {
      const shots = [{ x: 0, y: 0 }];
      const result = calculateAutoZoom(shots, 'AIR_RIFLE_10M', 400, airRifleRadii);
      expect(result).toBeCloseTo(7.1, 1);
    });

    it('zooms out from the 6-ring initial zoom when the first shot is outside that view', () => {
      const shots = [{ x: 15.25, y: 0 }];
      const result = calculateAutoZoom(shots, 'AIR_RIFLE_10M', 400, airRifleRadii);

      expect(result).toBeCloseTo(400 / ((15.25 + 2.25) * 1.1) / 5, 5);
      expect(result).toBeLessThan(7.1);
    });

    it('keeps a 4.0 -> 5.0 opening sequence visible instead of zooming to a tight group', () => {
      const shots = [
        { x: airRifleRadii[4]!, y: 0 },
        { x: airRifleRadii[5]!, y: 0 },
      ];
      const result = calculateAutoZoom(shots, 'AIR_RIFLE_10M', 400, airRifleRadii);

      expect(result).toBeCloseTo(400 / ((airRifleRadii[4]! + 2.25) * 1.1) / 5, 5);
      expect(result).toBeLessThan(ZOOM_LIMITS.MAX);
    });

    it('returns zoom based on 6-ring zone for PISTOL_25M with 0 shots', () => {
      // PISTOL_25M: 400 / (220.0 * 1.1) / 5 = 0.331
      const result = calculateAutoZoom([], 'PISTOL_25M', 400, pistol25mRadii);
      expect(result).toBeCloseTo(0.33, 1);
    });

    it('uses standard deviation instead of targetRadii 6-ring zone for 2+ shots', () => {
      const shots = [
        { x: 0, y: 5 },
        { x: 5, y: 0 },
        { x: -5, y: 0 },
        { x: 0, y: -5 },
      ];
      const withRadii = calculateAutoZoom(shots, 'AIR_RIFLE_10M', 400, airRifleRadii);
      const withoutRadii = calculateAutoZoom(shots, 'AIR_RIFLE_10M', 400);
      // targetRadii is not used for 2+ shots, so results are the same
      expect(withRadii).toBe(withoutRadii);
    });

    it('falls back to discipline-specific initial zoom when targetRadii has no 6-ring zone', () => {
      const incompleteRadii = { 10: 0.25, 1: 22.75 }; // No 6-ring zone
      const result = calculateAutoZoom([], 'AIR_RIFLE_10M', 400, incompleteRadii);
      expect(result).toBe(3.0); // INITIAL_ZOOM fallback
    });
  });
});

describe('calculateEffectiveZoom', () => {
  it('equals auto zoom when offset is 0', () => {
    expect(calculateEffectiveZoom(5.0, 0)).toBe(5.0);
  });

  it('zooms in with positive offset', () => {
    expect(calculateEffectiveZoom(5.0, 2.0)).toBe(7.0);
  });

  it('zooms out with negative offset', () => {
    expect(calculateEffectiveZoom(5.0, -2.0)).toBe(3.0);
  });

  it('final zoom value is always within MIN to MAX range', () => {
    expect(calculateEffectiveZoom(1.0, -5.0)).toBe(ZOOM_LIMITS.MIN);
    expect(calculateEffectiveZoom(8.0, 5.0)).toBe(ZOOM_LIMITS.MAX);
  });
});

describe('getNextZoomMode', () => {
  it('cycles in order AUTO -> RING_8 -> RING_6 -> RING_4 -> FULL -> AUTO', () => {
    expect(getNextZoomMode('AUTO')).toBe('RING_8');
    expect(getNextZoomMode('RING_8')).toBe('RING_6');
    expect(getNextZoomMode('RING_6')).toBe('RING_4');
    expect(getNextZoomMode('RING_4')).toBe('FULL');
    expect(getNextZoomMode('FULL')).toBe('AUTO');
  });

  it('throws error for invalid mode', () => {
    expect(() => getNextZoomMode('INVALID' as ZoomMode)).toThrow('Invalid ZoomMode: INVALID');
  });
});

describe('getPrevZoomMode', () => {
  it('cycles in reverse order RING_8 -> AUTO, RING_6 -> RING_8, RING_4 -> RING_6, FULL -> RING_4, AUTO -> FULL', () => {
    expect(getPrevZoomMode('RING_8')).toBe('AUTO');
    expect(getPrevZoomMode('RING_6')).toBe('RING_8');
    expect(getPrevZoomMode('RING_4')).toBe('RING_6');
    expect(getPrevZoomMode('FULL')).toBe('RING_4');
    expect(getPrevZoomMode('AUTO')).toBe('FULL');
  });

  it('throws error for invalid mode', () => {
    expect(() => getPrevZoomMode('INVALID' as ZoomMode)).toThrow('Invalid ZoomMode: INVALID');
  });

  it('getNextZoomMode and getPrevZoomMode are inverse operations', () => {
    const modes: ZoomMode[] = ['AUTO', 'RING_8', 'RING_6', 'RING_4', 'FULL'];

    modes.forEach((mode) => {
      const next = getNextZoomMode(mode);
      const prevOfNext = getPrevZoomMode(next);
      expect(prevOfNext).toBe(mode);

      const prev = getPrevZoomMode(mode);
      const nextOfPrev = getNextZoomMode(prev);
      expect(nextOfPrev).toBe(mode);
    });
  });
});

describe('calculateFixedZoom', () => {
  const mockTargetRadii = {
    1: 45.0, // FULL
    4: 30.0, // RING_4
    6: 20.0, // RING_6
    8: 10.0, // RING_8
    10: 0.5,
  };

  it('returns 0 for AUTO mode', () => {
    expect(calculateFixedZoom('AUTO', 'AIR_RIFLE_10M', mockTargetRadii)).toBe(0);
  });

  it('calculates appropriate zoom level for RING_8 mode', () => {
    const result = calculateFixedZoom('RING_8', 'AIR_RIFLE_10M', mockTargetRadii);
    // Zoom = 400 / (10.0 * 1.1) / 5 = 7.27...
    expect(result).toBeCloseTo(7.27, 1);
  });

  it('calculates appropriate zoom level for RING_6 mode', () => {
    const result = calculateFixedZoom('RING_6', 'AIR_RIFLE_10M', mockTargetRadii);
    // Zoom = 400 / (20.0 * 1.1) / 5 = 3.64...
    expect(result).toBeCloseTo(3.64, 1);
  });

  it('calculates appropriate zoom level for RING_4 mode', () => {
    const result = calculateFixedZoom('RING_4', 'AIR_RIFLE_10M', mockTargetRadii);
    // Zoom = 400 / (30.0 * 1.1) / 5 = 2.42...
    expect(result).toBeCloseTo(2.42, 1);
  });

  it('calculates appropriate zoom level for FULL mode', () => {
    const result = calculateFixedZoom('FULL', 'AIR_RIFLE_10M', mockTargetRadii);
    // Zoom = 400 / (45.0 * 1.1) / 5 = 1.62...
    expect(result).toBeCloseTo(1.62, 1);
  });

  it('zoom value is always clamped within ZOOM_LIMITS range', () => {
    // Test with extremely small radius (exceeding maximum)
    const smallRadii = { ...mockTargetRadii, 8: 0.01 };
    const result = calculateFixedZoom('RING_8', 'AIR_RIFLE_10M', smallRadii);
    expect(result).toBeLessThanOrEqual(ZOOM_LIMITS.MAX);
    expect(result).toBeGreaterThanOrEqual(ZOOM_LIMITS.MIN);
  });

  it('falls back to discipline-specific initial zoom when target ring does not exist', () => {
    const incompleteRadii = { 1: 45.0, 10: 0.5 }; // 8-ring zone does not exist
    const result = calculateFixedZoom('RING_8', 'AIR_RIFLE_10M', incompleteRadii);
    // Initial zoom for AIR_RIFLE_10M is 3.0
    expect(result).toBe(3.0);
  });

  it('returns discipline-specific initial zoom when target ring does not exist (all disciplines)', () => {
    const incompleteRadii = { 1: 45.0, 10: 0.5 }; // 8-ring zone does not exist
    expect(calculateFixedZoom('RING_8', 'BEAM_RIFLE_10M', incompleteRadii)).toBe(5.0);
    expect(calculateFixedZoom('RING_8', 'PISTOL_25M', incompleteRadii)).toBe(1.5);
  });
});
