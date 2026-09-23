import { z } from 'zod';

import { distanceUnitSchema } from './sight-adjustment';
import { atmosphereSchema } from './trajectory';

export type { DistanceUnit } from './sight-adjustment';
export type { AtmosphereSetting } from './trajectory';

/** A pellet is a few millimetres across, so the small units are the ones it is measured in. */
export const pelletDiameterUnitSchema = z.enum(['mm', 'inch']);
export type PelletDiameterUnit = z.infer<typeof pelletDiameterUnitSchema>;

/**
 * The shot charge as the box states it. Japanese shells are marked in grams and American
 * ones in ounces, and a shooter reads whichever is printed rather than converting first.
 */
export const shotChargeUnitSchema = z.enum(['g', 'oz']);
export type ShotChargeUnit = z.infer<typeof shotChargeUnitSchema>;

export const speedUnitSchema = z.enum(['mps', 'fps']);
export type SpeedUnit = z.infer<typeof speedUnitSchema>;

/**
 * One load of shot: the pellet, the material it is made of, how much of it the shell holds
 * and how fast it leaves the muzzle.
 *
 * The density is carried in grams per cubic centimetre, the unit every published table of
 * material densities uses, and converted to SI inside the calculation.
 */
export const pelletLoadSchema = z.object({
  diameter: z.number().finite().positive(),
  density: z.number().finite().positive(),
  shotCharge: z.number().finite().positive(),
  muzzleSpeed: z.number().finite().positive(),
});
export type PelletLoad = z.infer<typeof pelletLoadSchema>;

export const loadIdSchema = z.enum(['a', 'b']);
export type LoadId = z.infer<typeof loadIdSchema>;

export const shotPelletsSettingsSchema = z.object({
  // The two loads are only comparable while they are read in the same units, so the units are shared.
  diameterUnit: pelletDiameterUnitSchema,
  shotChargeUnit: shotChargeUnitSchema,
  speedUnit: speedUnitSchema,
  distanceUnit: distanceUnitSchema,
  step: z.number().finite().positive(),
  maxRange: z.number().finite().positive(),
  /** The distance the two loads are compared at, which is the range the shot is taken at. */
  referenceDistance: z.number().finite().positive(),
  atmosphere: atmosphereSchema,
  a: pelletLoadSchema,
  b: pelletLoadSchema,
});
export type ShotPelletsSettings = z.infer<typeof shotPelletsSettingsSchema>;
