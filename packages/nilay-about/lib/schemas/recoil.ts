import { z } from 'zod';

export const gunMassUnitSchema = z.enum(['kg', 'lb']);
export type GunMassUnit = z.infer<typeof gunMassUnitSchema>;

export const chargeMassUnitSchema = z.enum(['g', 'grain']);
export type ChargeMassUnit = z.infer<typeof chargeMassUnitSchema>;

export const velocityUnitSchema = z.enum(['m/s', 'fps']);
export type VelocityUnit = z.infer<typeof velocityUnitSchema>;

/**
 * Only the firearm types that the propellant gas factor is published for are offered.
 * A type without a published factor would need a number this tool cannot cite.
 */
export const firearmTypeSchema = z.enum(['rifle', 'shotgun-average', 'shotgun-long', 'handgun']);
export type FirearmType = z.infer<typeof firearmTypeSchema>;

export const recoilLoadSchema = z.object({
  gunMass: z.number().finite().positive(),
  projectileMass: z.number().finite().positive(),
  // Rifle and handgun cartridges carry no wad, so zero is an answer rather than a missing value.
  wadMass: z.number().finite().nonnegative(),
  // Zero powder stays valid: it is the case where the recoil is the projectile's momentum alone.
  powderMass: z.number().finite().nonnegative(),
  velocity: z.number().finite().positive(),
  firearmType: firearmTypeSchema,
});
export type RecoilLoad = z.infer<typeof recoilLoadSchema>;

export const loadIdSchema = z.enum(['a', 'b']);
export type LoadId = z.infer<typeof loadIdSchema>;

export const recoilSettingsSchema = z.object({
  // The two conditions are only comparable while they are read in the same units, so the units are shared.
  gunMassUnit: gunMassUnitSchema,
  chargeMassUnit: chargeMassUnitSchema,
  velocityUnit: velocityUnitSchema,
  a: recoilLoadSchema,
  b: recoilLoadSchema,
});
export type RecoilSettings = z.infer<typeof recoilSettingsSchema>;
