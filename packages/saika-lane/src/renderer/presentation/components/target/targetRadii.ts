// SPDX-License-Identifier: MIT
import type { Discipline } from '@/shared/ipc/contracts';

/**
 * Ring inner edge radius for rendering (mm)
 * Conforms to TARGET_SPEC.md
 */
export const TARGET_RADII: Record<Discipline, Record<number, number>> = {
  AIR_RIFLE_10M: {
    10: 0.25, // ring inner edge radius
    9: 2.75, // ring inner edge radius
    8: 5.25, // ring inner edge radius
    7: 7.75, // ring inner edge radius
    6: 10.25, // ring inner edge radius
    5: 12.75, // ring inner edge radius
    4: 15.25, // ring inner edge radius
    3: 17.75, // ring inner edge radius
    2: 20.25, // ring inner edge radius
    1: 22.75, // ring inner edge radius
  },
  BEAM_RIFLE_10M: {
    10: 0.5, // ring inner edge radius
    9: 3.0, // ring inner edge radius
    8: 5.5, // ring inner edge radius
    7: 8.0, // ring inner edge radius
    6: 10.5, // ring inner edge radius
    5: 13.0, // ring inner edge radius
    4: 15.5, // ring inner edge radius
    3: 18.0, // ring inner edge radius
    2: 20.5, // ring inner edge radius
    1: 23.0, // ring inner edge radius
  },
  AIR_PISTOL_10M: {
    10: 5.75, // ring inner edge radius
    9: 13.75, // ring inner edge radius
    8: 21.75, // ring inner edge radius
    7: 29.75, // ring inner edge radius
    6: 37.75, // ring inner edge radius
    5: 45.75, // ring inner edge radius
    4: 53.75, // ring inner edge radius
    3: 61.75, // ring inner edge radius
    2: 69.75, // ring inner edge radius
    1: 77.75, // ring inner edge radius
  },
  RIFLE_50M: {
    10: 5.2, // ring inner edge radius
    9: 13.2, // ring inner edge radius
    8: 21.2, // ring inner edge radius
    7: 29.2, // ring inner edge radius
    6: 37.2, // ring inner edge radius
    5: 45.2, // ring inner edge radius
    4: 53.2, // ring inner edge radius
    3: 61.2, // ring inner edge radius
    2: 69.2, // ring inner edge radius
    1: 77.2, // ring inner edge radius
  },
  PISTOL_25M: {
    10: 50.0, // ring inner edge radius
    9: 100.0, // ring inner edge radius
    8: 140.0, // ring inner edge radius
    7: 180.0, // ring inner edge radius
    6: 220.0, // ring inner edge radius
    5: 250.0, // ring inner edge radius
    4: 280.0, // ring inner edge radius
    3: 310.0, // ring inner edge radius
    2: 340.0, // ring inner edge radius
    1: 370.0, // ring inner edge radius
  },
};

export function getTargetRadii(discipline: Discipline): Record<number, number> {
  const radii = TARGET_RADII[discipline];
  if (!radii) {
    throw new Error(`Unknown discipline: ${discipline}`);
  }
  return radii;
}
