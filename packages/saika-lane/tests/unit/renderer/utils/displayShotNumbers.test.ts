// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { withDisplayShotNumbers } from '@/renderer/presentation/utils/displayShotNumbers';
import type { ShotDto } from '@/shared/ipc/contracts';

function shot(overrides: Partial<ShotDto>): ShotDto {
  return {
    id: overrides.id ?? `shot-${overrides.shotNumber ?? 1}`,
    shotNumber: overrides.shotNumber ?? 1,
    seriesNumber: overrides.seriesNumber,
    x: 0,
    y: 0,
    score: 100,
    innerTen: false,
    timestamp: '2026-01-01T00:00:00.000Z',
    mode: overrides.mode ?? 'MATCH',
    isRecorded: overrides.isRecorded ?? true,
  };
}

describe('withDisplayShotNumbers', () => {
  it('keeps session-wide shot numbers when seriesNumber is unavailable', () => {
    const shots = [shot({ shotNumber: 11 })];

    const result = withDisplayShotNumbers(shots);

    expect(result[0]?.shotNumber).toBe(11);
  });

  it('resets display shot numbers for each match series', () => {
    const shots = [
      shot({ id: 'series-2-9', shotNumber: 9, seriesNumber: 2 }),
      shot({ id: 'series-2-10', shotNumber: 10, seriesNumber: 2 }),
      shot({ id: 'series-3-11', shotNumber: 11, seriesNumber: 3 }),
      shot({ id: 'series-3-12', shotNumber: 12, seriesNumber: 3 }),
    ];

    const result = withDisplayShotNumbers(shots);

    expect(result.map((s) => s.shotNumber)).toEqual([1, 2, 1, 2]);
  });

  it('counts sighting and match shots separately', () => {
    const shots = [
      shot({ id: 'sighting-1', shotNumber: 1, seriesNumber: 0, mode: 'SIGHTING', isRecorded: false }),
      shot({ id: 'match-1', shotNumber: 2, seriesNumber: 2, mode: 'MATCH' }),
      shot({ id: 'sighting-2', shotNumber: 3, seriesNumber: 0, mode: 'SIGHTING', isRecorded: false }),
      shot({ id: 'match-2', shotNumber: 4, seriesNumber: 2, mode: 'MATCH' }),
    ];

    const result = withDisplayShotNumbers(shots);

    expect(result.map((s) => s.shotNumber)).toEqual([1, 1, 2, 2]);
  });
});
