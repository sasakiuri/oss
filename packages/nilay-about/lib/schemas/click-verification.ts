import { z } from 'zod';

import { distanceUnitSchema, offsetUnitSchema } from './sight-adjustment';

export type { DistanceUnit, OffsetUnit } from './sight-adjustment';

export const angleUnitSchema = z.enum(['moa', 'mil']);
export type AngleUnit = z.infer<typeof angleUnitSchema>;

/**
 * The click value printed on the turret. The unit of the dialled amount follows from it, so the
 * two can never be entered in different units.
 */
export const nominalClickSchema = z.enum(['1/8-moa', '1/4-moa', '1/2-moa', '1-moa', '0.05-mil', '0.1-mil']);
export type NominalClick = z.infer<typeof nominalClickSchema>;

export const lateralSideSchema = z.enum(['right', 'left']);
export type LateralSide = z.infer<typeof lateralSideSchema>;

export const clickVerificationSettingsSchema = z.object({
  distance: z.object({ value: z.number().finite().positive(), unit: distanceUnitSchema }),
  click: nominalClickSchema,
  /** The elevation dialled between the two groups, in the unit of the click value. */
  dial: z.number().finite().positive(),
  /** Unit shared by the measured travel and the sideways offset. */
  measureUnit: offsetUnitSchema,
  /** Distance between the two group centres, measured along the vertical line. */
  measured: z.number().finite().positive(),
  /** How far the upper group sits off the vertical line. Zero when it is on the line. */
  lateral: z.object({ value: z.number().finite().nonnegative(), side: lateralSideSchema }),
});
export type ClickVerificationSettings = z.infer<typeof clickVerificationSettingsSchema>;
