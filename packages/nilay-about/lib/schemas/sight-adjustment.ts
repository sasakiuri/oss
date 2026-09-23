import { z } from 'zod';

export const distanceUnitSchema = z.enum(['m', 'yd']);
export type DistanceUnit = z.infer<typeof distanceUnitSchema>;

export const offsetUnitSchema = z.enum(['mm', 'cm', 'inch']);
export type OffsetUnit = z.infer<typeof offsetUnitSchema>;

export const verticalImpactSchema = z.enum(['high', 'low']);
export type VerticalImpact = z.infer<typeof verticalImpactSchema>;

export const horizontalImpactSchema = z.enum(['right', 'left']);
export type HorizontalImpact = z.infer<typeof horizontalImpactSchema>;

export type ImpactDirection = VerticalImpact | HorizontalImpact;

export const clickPresetSchema = z.enum(['1/8-moa', '1/4-moa', '1/2-moa', '1-moa', '0.05-mil', '0.1-mil', 'custom']);
export type ClickPreset = z.infer<typeof clickPresetSchema>;

export const clickSettingSchema = z.object({
  preset: clickPresetSchema,
  // Custom turrets are published as travel per 100 m rather than as an angle.
  customMmPer100m: z.number().finite().positive(),
});
export type ClickSetting = z.infer<typeof clickSettingSchema>;

export const sightAdjustmentSettingsSchema = z.object({
  distance: z.object({ value: z.number().finite().positive(), unit: distanceUnitSchema }),
  offsetUnit: offsetUnitSchema,
  vertical: z.object({ direction: verticalImpactSchema, value: z.number().finite().nonnegative() }),
  horizontal: z.object({ direction: horizontalImpactSchema, value: z.number().finite().nonnegative() }),
  click: clickSettingSchema,
  slant: z.object({
    value: z.number().finite().positive(),
    // Negative angles are downhill shots; both directions share the same cosine.
    angleDegrees: z.number().finite().min(-90).max(90),
  }),
});
export type SightAdjustmentSettings = z.infer<typeof sightAdjustmentSettingsSchema>;
