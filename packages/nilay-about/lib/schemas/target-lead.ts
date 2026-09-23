import { z } from 'zod';

import { distanceUnitSchema } from './sight-adjustment';

/** The units a speedometer, a radar reading or a published figure for a flying bird is already in. */
export const targetSpeedUnitSchema = z.enum(['km/h', 'm/s', 'mph']);
export type TargetSpeedUnit = z.infer<typeof targetSpeedUnitSchema>;

/** The two units a cartridge or a load is quoted in. */
export const projectileSpeedUnitSchema = z.enum(['m/s', 'fps']);
export type ProjectileSpeedUnit = z.infer<typeof projectileSpeedUnitSchema>;

export type SpeedUnit = TargetSpeedUnit | ProjectileSpeedUnit;

export const targetLeadSettingsSchema = z.object({
  // A standing target is a fair question with the answer zero, so this only has to be non-negative.
  targetSpeed: z.object({ value: z.number().finite().nonnegative(), unit: targetSpeedUnitSchema }),
  distance: z.object({ value: z.number().finite().positive(), unit: distanceUnitSchema }),
  // The angle between the target's path and the line of sight: 90 is a full crossing target, 0 is one
  // coming straight on or going straight away. Past 90 the target is opening the range, and the lateral
  // component is the same as at its mirror angle because sin(180 - x) equals sin(x).
  crossingAngleDegrees: z.number().finite().min(0).max(180),
  // The average speed out to the distance, not the muzzle velocity. See lib/target-lead.ts.
  projectileSpeed: z.object({ value: z.number().finite().positive(), unit: projectileSpeedUnitSchema }),
  // Lock time plus the shooter's own delay, and zero unless they have a figure for it.
  delaySeconds: z.number().finite().nonnegative(),
});
export type TargetLeadSettings = z.infer<typeof targetLeadSettingsSchema>;
