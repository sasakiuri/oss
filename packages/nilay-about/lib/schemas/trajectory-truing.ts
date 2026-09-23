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

/** Which of the two the solve is allowed to move. The other one carries the error of both. */
export const truingTargetSchema = z.enum(['ballistic-coefficient', 'muzzle-speed']);

/** How the group was written down: as a length on the target, or as the angle a sight is marked in. */
export const dropReadingSchema = z.enum(['offset', 'moa', 'mil']);

const finite = z.number().finite();

/**
 * One group, at one distance.
 *
 * The id is the row's own, so that editing a distance does not make the row a different row and
 * lose what was typed beside it. The drop carries its sign: a group above the point of aim is a
 * negative drop, which is what a rifle does inside its zero.
 */
export const truingMeasurementSchema = z.object({
  id: z.string().min(1),
  distance: finite.positive(),
  drop: finite,
});
export type TruingMeasurementSetting = z.infer<typeof truingMeasurementSchema>;

/**
 * More rows than anyone fires in an afternoon.
 *
 * A solve over one parameter is not improved by more distances past the point where the far ones
 * dominate it, and a form long enough to scroll is a form with stale rows left in it.
 */
export const TRUING_MEASUREMENT_LIMIT = 10;

/**
 * The finest measurement the model can be held to, in metres.
 *
 * The departure angle is solved until the path is within a tenth of a millimetre of the line of
 * sight, so a tolerance below a millimetre would be decided by that solve rather than by the
 * shooting. It is also finer than anyone measures the centre of a group to.
 */
export const TRUING_TOLERANCE_FLOOR_METERS = 0.001;

/** The tolerance is typed in the drop unit, so the floor has to be read in it too. */
export function toleranceMeters(tolerance: number, dropUnit: 'cm' | 'inch'): number {
  return dropUnit === 'cm' ? tolerance / 100 : tolerance * 0.0254;
}

export const truingSettingsSchema = z
  .object({
    muzzleSpeed: z.object({ value: finite.positive(), unit: speedUnitSchema }),
    // The same band the trajectory tool accepts, so a load can be carried between the two.
    ballisticCoefficient: finite.min(0.01).max(2),
    dragModel: dragModelSchema,
    sightHeight: z.object({ value: finite.nonnegative(), unit: sightHeightUnitSchema }),
    distanceUnit: distanceUnitSchema,
    zeroDistance: finite.positive(),
    dropUnit: dropUnitSchema,
    reading: dropReadingSchema,
    measurements: z.array(truingMeasurementSchema).max(TRUING_MEASUREMENT_LIMIT),
    /** How closely the shooter knows each reading, in the drop unit. */
    tolerance: finite.positive(),
    target: truingTargetSchema,
    atmosphere: atmosphereSchema,
  })
  .superRefine((settings, context) => {
    if (toleranceMeters(settings.tolerance, settings.dropUnit) < TRUING_TOLERANCE_FLOOR_METERS)
      context.addIssue({
        code: 'custom',
        path: ['tolerance'],
        message: 'A tolerance finer than a millimetre is decided by the solve rather than by the shooting.',
      });
  });
export type TruingSettings = z.infer<typeof truingSettingsSchema>;
