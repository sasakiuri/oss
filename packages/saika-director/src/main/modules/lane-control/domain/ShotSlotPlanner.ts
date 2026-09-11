/** One-based position of a shot within a scored stage and series. */
export interface ShotSlotAddress {
  readonly shotNumber: number;
  readonly seriesNumber: number;
  readonly slotNumber: number;
}

export interface RemainingSeriesSlotsInput {
  readonly firstShotNumber: number;
  readonly seriesNumber: number;
  readonly expectedShots: number;
  readonly occupiedShots: number;
}

export function planRemainingSeriesSlots(input: RemainingSeriesSlotsInput): ShotSlotAddress[] {
  const occupiedShots = clampOccupiedShots(input.occupiedShots, input.expectedShots);
  return Array.from({ length: input.expectedShots - occupiedShots }, (_, index) => ({
    shotNumber: input.firstShotNumber + index,
    seriesNumber: input.seriesNumber,
    slotNumber: occupiedShots + index + 1,
  }));
}

export interface RemainingStageSlotsInput {
  readonly firstShotNumber: number;
  readonly firstSeriesNumber: number;
  readonly seriesShotCounts: readonly number[];
  readonly occupiedShotsInFirstSeries: number;
}

export function planRemainingStageSlots(input: RemainingStageSlotsInput): ShotSlotAddress[] {
  const slots: ShotSlotAddress[] = [];
  let nextShotNumber = input.firstShotNumber;

  input.seriesShotCounts.forEach((expectedShots, relativeSeriesIndex) => {
    const occupiedShots = relativeSeriesIndex === 0 ? input.occupiedShotsInFirstSeries : 0;
    const seriesSlots = planRemainingSeriesSlots({
      firstShotNumber: nextShotNumber,
      seriesNumber: input.firstSeriesNumber + relativeSeriesIndex,
      expectedShots,
      occupiedShots,
    });
    slots.push(...seriesSlots);
    nextShotNumber += seriesSlots.length;
  });

  return slots;
}

function clampOccupiedShots(occupiedShots: number, expectedShots: number): number {
  if (!Number.isInteger(expectedShots) || expectedShots < 0) {
    throw new Error(`expectedShots must be a non-negative integer, got ${expectedShots}`);
  }
  if (!Number.isInteger(occupiedShots) || occupiedShots < 0 || occupiedShots > expectedShots) {
    throw new Error(`occupiedShots must be between 0 and ${expectedShots}, got ${occupiedShots}`);
  }
  return occupiedShots;
}
