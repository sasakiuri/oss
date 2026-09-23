import { z } from 'zod';

import { distanceUnitSchema, offsetUnitSchema } from './sight-adjustment';

const finite = z.number().finite();

/** Millimetres from the aim point, x to the right and y upwards. */
export const shotImpactSchema = z.object({ x: finite, y: finite });
export type ShotImpact = z.infer<typeof shotImpactSchema>;

/**
 * How closely the reader wants the mean point of impact known. It is a target they choose rather
 * than a length they measured, so it can be set either as a size on the target or as an angle,
 * and the tool reads it in whichever of the two the shooter thinks in.
 */
export const precisionUnitSchema = z.union([offsetUnitSchema, z.enum(['moa', 'mil'])]);
export type PrecisionUnit = z.infer<typeof precisionUnitSchema>;

/** A bullet is sold under a metric or an imperial calibre, so the diameter keeps the unit it was read in. */
export const bulletUnitSchema = z.enum(['mm', 'inch']);
export type BulletUnit = z.infer<typeof bulletUnitSchema>;

// A saved group never carries the photo: only the impacts in millimetres and the setup they were measured under.
export const groupRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  savedAt: z.string().min(1),
  // The distance is part of the measurement, not of the tool: MOA and mil mean nothing without it.
  distance: z.object({ value: finite.positive(), unit: distanceUnitSchema }),
  /** Null when it was left blank, in which case only the centre-to-centre measure is shown. */
  bulletDiameterMm: finite.positive().nullable(),
  note: z.string(),
  impacts: z.array(shotImpactSchema),
});
export type GroupRecord = z.infer<typeof groupRecordSchema>;
