import { z } from 'zod';

export const meatYieldSpeciesSchema = z.enum(['deer', 'boar', 'other']);
export type MeatYieldSpecies = z.infer<typeof meatYieldSpeciesSchema>;

/** The stage the weighed animal was at: whole, with the viscera out, or dressed down to the carcass. */
export const weighedStageSchema = z.enum(['whole', 'dressed', 'carcass']);
export type WeighedStage = z.infer<typeof weighedStageSchema>;

/** A share of the whole body weight, in percent. `null` is a coefficient the reader has not given. */
const percentSchema = z.number().finite().gt(0).max(100).nullable();

export const yieldRatiosSchema = z.object({
  dressed: percentSchema,
  carcass: percentSchema,
  meat: percentSchema,
});
export type YieldRatios = z.infer<typeof yieldRatiosSchema>;

export const meatYieldSettingsSchema = z.object({
  species: meatYieldSpeciesSchema,
  stage: weighedStageSchema,
  weightKg: z.number().finite().positive(),
  ratios: yieldRatiosSchema,
  packGrams: z.number().finite().positive(),
  /** What the reader's own freezer holds, by weight. Nothing is converted from its volume. */
  freezerKg: z.number().finite().positive().nullable(),
});
export type MeatYieldSettings = z.infer<typeof meatYieldSettingsSchema>;
