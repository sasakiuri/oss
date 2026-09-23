import { z } from 'zod';

import { atmosphereSchema, massUnitSchema, speedUnitSchema } from './trajectory';

export type { AtmosphereSetting, MassUnit, SpeedUnit } from './trajectory';

/**
 * The unit a bullet's own measurements are read in.
 *
 * Both members are also members of the offset unit the sight tool converts with, so the
 * millimetre conversions there take these values as they stand rather than through a
 * second table. A bullet is measured with a caliper or read off a maker's drawing, and
 * neither ever states a centimetre.
 */
export const bulletLengthUnitSchema = z.enum(['mm', 'inch']);
export type BulletLengthUnit = z.infer<typeof bulletLengthUnitSchema>;

/**
 * Stability factors the published recommendations run between.
 *
 * Don Miller, "How Good Are Simple Rules For Estimating Rifling Twist", Precision Shooting,
 * June 2009: the military usually chooses 1.5 to 2.5, 2.0 is safe against cold weather, 1.5
 * suits most applications, and benchrest shooters often opt for 1.3. The same article notes
 * that factors as high as 3.5 to 4.0 are usually not detrimental, which is where the upper
 * bound comes from. Below 1.0 the bullet is unstable by the rule's own criterion, so asking
 * for a twist that only just reaches it would be asking for a barrel to tumble bullets.
 */
export const MIN_TARGET_STABILITY = 1;
export const MAX_TARGET_STABILITY = 4;

/**
 * The units are held apart from the numbers because they are shared.
 *
 * A diameter and a length are read off the same caliper, so one unit covers both and the
 * reader is never left comparing a bullet measured two ways. The twist keeps its own unit:
 * a barrel is quoted in inches per turn nearly everywhere, including on rifles whose every
 * other dimension is metric.
 */
export const twistStabilitySettingsSchema = z.object({
  bulletUnit: bulletLengthUnitSchema,
  twistUnit: bulletLengthUnitSchema,
  massUnit: massUnitSchema,
  speedUnit: speedUnitSchema,
  diameter: z.number().finite().positive(),
  length: z.number().finite().positive(),
  mass: z.number().finite().positive(),
  /** One turn of the rifling in this much barrel. */
  twist: z.number().finite().positive(),
  muzzleSpeed: z.number().finite().positive(),
  targetStability: z.number().finite().min(MIN_TARGET_STABILITY).max(MAX_TARGET_STABILITY),
  atmosphere: atmosphereSchema,
});
export type TwistStabilitySettings = z.infer<typeof twistStabilitySettingsSchema>;
