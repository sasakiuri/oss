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

const customMmPer100mSchema = z.number().finite().positive();

/**
 * Custom turrets are published as travel per 100 m rather than as an angle. Only a custom click
 * value needs that travel: a turret in MOA or mil is read without it, and keeps one only so a
 * travel typed before stays when custom is chosen again.
 */
export const clickSettingSchema = z.discriminatedUnion('preset', [
  z.object({ preset: z.literal('custom'), customMmPer100m: customMmPer100mSchema }),
  z.object({ preset: clickPresetSchema.exclude(['custom']), customMmPer100m: customMmPer100mSchema.optional() }),
]);
export type ClickSetting = z.infer<typeof clickSettingSchema>;

/**
 * The click value with another preset chosen. A custom travel that is blank or not a travel is not
 * carried to a MOA or mil preset, where it would keep the settings from being saved for a number
 * the preset does not read; custom opens it blank again.
 */
export function withClickPreset(click: ClickSetting | undefined, preset: ClickPreset): ClickSetting {
  const typed = click?.customMmPer100m;
  if (preset === 'custom') return { preset, customMmPer100m: typed ?? NaN };
  return customMmPer100mSchema.safeParse(typed).success ? { preset, customMmPer100m: typed } : { preset };
}

export const sightAdjustmentSettingsSchema = z.object({
  distance: z.object({ value: z.number().finite().positive(), unit: distanceUnitSchema }),
  offsetUnit: offsetUnitSchema,
  vertical: z.object({ direction: verticalImpactSchema, value: z.number().finite().nonnegative() }),
  horizontal: z.object({ direction: horizontalImpactSchema, value: z.number().finite().nonnegative() }),
  click: clickSettingSchema,
  slant: z.object({
    value: z.number().finite().positive(),
    // Negative angles are downhill shots; both directions share the same horizontal distance.
    angleDegrees: z.number().finite().min(-90).max(90),
  }),
});
export type SightAdjustmentSettings = z.infer<typeof sightAdjustmentSettingsSchema>;
