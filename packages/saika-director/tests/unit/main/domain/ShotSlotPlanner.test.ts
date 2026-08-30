import { describe, expect, it } from 'vitest';
import { planRemainingSeriesSlots, planRemainingStageSlots } from '@/main/modules/lane-control/domain/ShotSlotPlanner';

describe('ShotSlotPlanner', () => {
  it('plans only unoccupied slots in the current series', () => {
    expect(
      planRemainingSeriesSlots({
        firstShotNumber: 14,
        seriesNumber: 3,
        expectedShots: 5,
        occupiedShots: 3,
      }),
    ).toEqual([
      { shotNumber: 14, seriesNumber: 3, slotNumber: 4 },
      { shotNumber: 15, seriesNumber: 3, slotNumber: 5 },
    ]);
  });

  it('plans the current remainder and every later series in a stage', () => {
    expect(
      planRemainingStageSlots({
        firstShotNumber: 8,
        firstSeriesNumber: 2,
        seriesShotCounts: [5, 2],
        occupiedShotsInFirstSeries: 2,
      }),
    ).toEqual([
      { shotNumber: 8, seriesNumber: 2, slotNumber: 3 },
      { shotNumber: 9, seriesNumber: 2, slotNumber: 4 },
      { shotNumber: 10, seriesNumber: 2, slotNumber: 5 },
      { shotNumber: 11, seriesNumber: 3, slotNumber: 1 },
      { shotNumber: 12, seriesNumber: 3, slotNumber: 2 },
    ]);
  });

  it('rejects an occupied count outside the series boundary', () => {
    expect(() =>
      planRemainingSeriesSlots({
        firstShotNumber: 1,
        seriesNumber: 1,
        expectedShots: 2,
        occupiedShots: 3,
      }),
    ).toThrow('occupiedShots must be between 0 and 2');
  });
});
