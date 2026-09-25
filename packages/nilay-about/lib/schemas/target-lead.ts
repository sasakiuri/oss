import { z } from 'zod';

import { distanceUnitSchema } from './sight-adjustment';

/** The units a speedometer, a radar reading or a published figure for a flying bird is already in. */
export const targetSpeedUnitSchema = z.enum(['km/h', 'm/s', 'mph']);
export type TargetSpeedUnit = z.infer<typeof targetSpeedUnitSchema>;

/** The two units a cartridge or a load is quoted in. */
export const projectileSpeedUnitSchema = z.enum(['m/s', 'fps']);
export type ProjectileSpeedUnit = z.infer<typeof projectileSpeedUnitSchema>;

export type SpeedUnit = TargetSpeedUnit | ProjectileSpeedUnit;

/** Steepest line of sight or path accepted, in degrees; see MAX_TILT_DEGREES in lib/target-lead.ts. */
const tiltSchema = z.number().finite().min(-85).max(85);

/** `drag` flies one pellet from the muzzle velocity; `average` takes the average speed as entered. */
export const speedModelSchema = z.enum(['drag', 'average']);
export type SpeedModel = z.infer<typeof speedModelSchema>;

export const targetLeadSettingsSchema = z.object({
  // A standing target is a fair question with the answer zero, so this only has to be non-negative.
  targetSpeed: z.object({ value: z.number().finite().nonnegative(), unit: targetSpeedUnitSchema }),
  distance: z.object({ value: z.number().finite().positive(), unit: distanceUnitSchema }),
  // The angle between the target's path and the line of sight: 90 is a full crossing target, 0 is one
  // coming straight on or going straight away. Past 90 the target is opening the range, and the lateral
  // component is the same as at its mirror angle because sin(180 - x) equals sin(x).
  crossingAngleDegrees: z.number().finite().min(0).max(180),
  // The muzzle velocity when the speed model is `drag`, the average speed out to the distance when it
  // is `average`. See lib/target-lead.ts.
  projectileSpeed: z.object({ value: z.number().finite().positive(), unit: projectileSpeedUnitSchema }),
  // Lock time plus the shooter's own delay, and zero unless they have a figure for it.
  delaySeconds: z.number().finite().nonnegative(),
  // How high the target is above the gun, and how steeply it climbs (positive) or drops (negative).
  elevationDegrees: tiltSchema,
  climbDegrees: tiltSchema,
  speedModel: speedModelSchema,
  // The pellet flown when the speed model is `drag`.
  pellet: z.object({ diameterMm: z.number().finite().positive(), densityGcm3: z.number().finite().positive() }),
});
export type TargetLeadSettings = z.infer<typeof targetLeadSettingsSchema>;
