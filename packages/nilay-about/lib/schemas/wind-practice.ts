import { z } from 'zod';

import { distanceUnitSchema } from './sight-adjustment';
import { dragModelSchema, speedUnitSchema, windSpeedUnitSchema } from './trajectory';

/** Answers kept for the tally of weak directions. Older ones drop off, so the tally follows recent practice. */
export const MAX_PRACTICE_ATTEMPTS = 200;

export const practiceAttemptSchema = z.object({
  kind: z.enum(['value', 'hold']),
  hour: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(9),
    z.literal(10),
    z.literal(11),
    z.literal(12),
  ]),
  correct: z.boolean(),
});

export const windPracticeSettingsSchema = z
  .object({
    kind: z.enum(['value', 'hold']),
    load: z.object({
      muzzleSpeed: z.object({ value: z.number().finite().positive(), unit: speedUnitSchema }),
      ballisticCoefficient: z.number().finite().min(0.01).max(2),
      dragModel: dragModelSchema,
    }),
    distanceUnit: distanceUnitSchema,
    windUnit: windSpeedUnitSchema,
    angleUnit: z.enum(['mil', 'moa']),
    maxSpeed: z.number().int().min(1).max(30),
    minDistance: z.number().finite().positive(),
    maxDistance: z.number().finite().positive(),
    distanceStep: z.number().finite().positive(),
    /** How far off a share of the wind may be and still count, in percentage points. */
    valueTolerance: z.number().finite().positive().max(50),
    /** How far off a hold may be and still count, in the angle unit. */
    holdTolerance: z.number().finite().positive(),
    attempts: z.array(practiceAttemptSchema).max(MAX_PRACTICE_ATTEMPTS),
  })
  .refine((settings) => settings.maxDistance >= settings.minDistance, {
    path: ['maxDistance'],
    message: 'The furthest distance cannot be nearer than the nearest.',
  });
export type WindPracticeSettings = z.infer<typeof windPracticeSettingsSchema>;
