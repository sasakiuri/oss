import { z } from 'zod';

import { distanceUnitSchema } from './sight-adjustment';
import { atmosphereSchema, dragModelSchema, massUnitSchema, speedUnitSchema } from './trajectory';

export type { DistanceUnit } from './sight-adjustment';
export type { AtmosphereSetting, DragModel, MassUnit, SpeedUnit } from './trajectory';

/**
 * What is being fired.
 *
 * A bullet is described by the ballistic coefficient its maker publishes; a sphere by the
 * size and the metal it is made of, because no maker publishes a coefficient for one pellet
 * out of a shotshell. The two need different questions, so they are two forms rather than
 * one form with fields that sometimes mean nothing.
 */
export const projectileKindSchema = z.enum(['bullet', 'sphere']);
export type ProjectileKind = z.infer<typeof projectileKindSchema>;

/** A pellet is a couple of millimetres, so the small units. */
export const diameterUnitSchema = z.enum(['mm', 'inch']);
export type DiameterUnit = z.infer<typeof diameterUnitSchema>;

/** The muzzle is a metre or two up, or tens of metres up on a high seat. */
export const heightUnitSchema = z.enum(['m', 'ft']);
export type HeightUnit = z.infer<typeof heightUnitSchema>;

export const bulletSchema = z.object({
  // The same band the trajectory tool accepts: a round ball at one end, a long match bullet
  // at the other. Outside it the number is a typing slip rather than a load.
  ballisticCoefficient: z.number().finite().min(0.01).max(2),
  dragModel: dragModelSchema,
  mass: z.object({ value: z.number().finite().positive(), unit: massUnitSchema }),
});
export type BulletSetting = z.infer<typeof bulletSchema>;

export const sphereSchema = z.object({
  diameter: z.object({ value: z.number().finite().positive(), unit: diameterUnitSchema }),
  /**
   * Density of the metal, in kilograms per cubic metre.
   *
   * It is typed in rather than chosen from a list. Shot is not the pure metal: lead shot is
   * hardened with antimony, and the non-lead shot sold for waterfowl ranges from steel to
   * tungsten composites whose density is the maker's own. A list would have to put a number
   * on a named material that this tool cannot cite for any particular load.
   */
  densityKgPerM3: z.number().finite().positive(),
});
export type SphereSetting = z.infer<typeof sphereSchema>;

export const maxRangeSettingsSchema = z.object({
  kind: projectileKindSchema,
  // Both descriptions are carried whichever is in use, so switching back brings the last
  // one rather than an empty form, and both survive a reload.
  bullet: bulletSchema,
  sphere: sphereSchema,
  muzzleSpeed: z.object({ value: z.number().finite().positive(), unit: speedUnitSchema }),
  launchHeight: z.object({ value: z.number().finite().nonnegative(), unit: heightUnitSchema }),
  // Straight up is 90 degrees: it comes back to the muzzle, which is the answer to a
  // question people do ask. Below the horizontal there is nothing to work out on flat ground.
  elevationDegrees: z.number().finite().min(0).max(90),
  distanceUnit: distanceUnitSchema,
  atmosphere: atmosphereSchema,
});
export type MaxRangeSettings = z.infer<typeof maxRangeSettingsSchema>;
