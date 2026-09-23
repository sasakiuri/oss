import { z } from 'zod';

// The distance unit is the one the sight adjustment tool already defines, so `toMeters` and `fromMeters`
// accept it without a cast. It is not re-exported: the other tools reach for it there directly, and a
// second path to the same type is a way for two modules to disagree about where it comes from.
import { distanceUnitSchema } from './sight-adjustment';

/** Reticle graduations are published either in milliradians or in minutes of angle. */
export const reticleUnitSchema = z.enum(['mil', 'moa']);
export type ReticleUnit = z.infer<typeof reticleUnitSchema>;

/** A target is measured in the field with a tape or from a reference book, so metres belong here too. */
export const targetSizeUnitSchema = z.enum(['cm', 'inch', 'm']);
export type TargetSizeUnit = z.infer<typeof targetSizeUnitSchema>;

/**
 * First focal plane reticles keep their subtensions at every magnification.
 * Second focal plane reticles only read true at the magnification they were calibrated for.
 */
export const focalPlaneSchema = z.enum(['ffp', 'sfp']);
export type FocalPlane = z.infer<typeof focalPlaneSchema>;

/** Which of the three quantities is the answer; the other two are the inputs. */
export const solveForSchema = z.enum(['distance', 'size', 'apparent']);
export type SolveFor = z.infer<typeof solveForSchema>;

export const reticleRangingSettingsSchema = z.object({
  solveFor: solveForSchema,
  // Every quantity stays in the store even while it is the answer, so switching direction keeps what was typed.
  targetSize: z.object({ value: z.number().finite().positive(), unit: targetSizeUnitSchema }),
  apparent: z.object({ value: z.number().finite().positive(), unit: reticleUnitSchema }),
  distance: z.object({ value: z.number().finite().positive(), unit: distanceUnitSchema }),
  focalPlane: focalPlaneSchema,
  // Only the ratio of the two matters, and only on a second focal plane reticle.
  magnification: z.object({
    calibration: z.number().finite().positive(),
    used: z.number().finite().positive(),
  }),
});
export type ReticleRangingSettings = z.infer<typeof reticleRangingSettingsSchema>;
