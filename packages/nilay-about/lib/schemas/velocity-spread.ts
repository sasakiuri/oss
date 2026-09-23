import { z } from 'zod';

import { distanceUnitSchema } from './sight-adjustment';
import {
  atmosphereSchema,
  dragModelSchema,
  dropUnitSchema,
  sightHeightUnitSchema,
  speedUnitSchema,
} from './trajectory';

export type { DistanceUnit } from './sight-adjustment';
export type { AtmosphereSetting, DragModel, DropUnit, SightHeightUnit, SpeedUnit } from './trajectory';

const finite = z.number().finite();

/**
 * Room for a long string and the punctuation around it, and no room for a document.
 *
 * Sixty readings of six characters with a separator between them is under five hundred, so this
 * holds every string the tool will summarise and still bounds what is written to the browser.
 */
export const VELOCITY_READINGS_MAX = 1000;

/** More rows than a drop chart is read at, and few enough to stay on one screen. */
export const VELOCITY_SPREAD_ROW_LIMIT = 20;

export const velocitySpreadSettingsSchema = z.object({
  /**
   * The string as it was typed or pasted, rather than the numbers parsed out of it.
   *
   * What a shooter typed is what they should find when they come back, including the entry that
   * was not a speed: rewriting their column as a tidy list would hide the typing slip the screen
   * is pointing at.
   */
  readings: z.string().max(VELOCITY_READINGS_MAX),
  speedUnit: speedUnitSchema,
  // The same band the trajectory tool accepts, so a load can be carried between the two.
  ballisticCoefficient: finite.min(0.01).max(2),
  dragModel: dragModelSchema,
  sightHeight: z.object({ value: finite.nonnegative(), unit: sightHeightUnitSchema }),
  distanceUnit: distanceUnitSchema,
  zeroDistance: finite.positive(),
  step: finite.positive(),
  maxRange: finite.positive(),
  dropUnit: dropUnitSchema,
  /** How closely the shooter wants the deviation itself known, as a percentage of it. */
  sdPrecisionPercent: finite.min(1).max(100),
  atmosphere: atmosphereSchema,
});
export type VelocitySpreadSettings = z.infer<typeof velocitySpreadSettingsSchema>;
