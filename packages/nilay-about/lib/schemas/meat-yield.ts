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

export const MEAT_YIELD_MAX_ROWS = 16;
export const MEAT_YIELD_MAX_NAME = 30;

/**
 * A cut the meat is sold as: its share of the usable meat and its price per kilogram. Either may be
 * left empty (`null`) while it is not known.
 */
export const meatYieldPartSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(MEAT_YIELD_MAX_NAME),
  percent: z.number().finite().nullable(),
  pricePerKg: z.number().finite().nullable(),
});
export type MeatYieldPart = z.infer<typeof meatYieldPartSchema>;

/** A cost for the animal, such as a processing fee or packaging, in yen. */
export const meatYieldCostSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(MEAT_YIELD_MAX_NAME),
  yen: z.number().finite().nullable(),
});
export type MeatYieldCost = z.infer<typeof meatYieldCostSchema>;

export const meatYieldSettingsSchema = z.object({
  species: meatYieldSpeciesSchema,
  stage: weighedStageSchema,
  weightKg: z.number().finite().positive(),
  ratios: yieldRatiosSchema,
  packGrams: z.number().finite().positive(),
  /** What the reader's own freezer holds, by weight. Nothing is converted from its volume. */
  freezerKg: z.number().finite().positive().nullable(),
  // Added after settings were first saved: optional so earlier settings still read. Absent means none entered.
  parts: z.array(meatYieldPartSchema).max(MEAT_YIELD_MAX_ROWS).optional(),
  costs: z.array(meatYieldCostSchema).max(MEAT_YIELD_MAX_ROWS).optional(),
  /** A capture subsidy or other income per animal, in yen. It differs by municipality, so it is entered. */
  subsidyYen: z.number().finite().nullable().optional(),
});
export type MeatYieldSettings = z.infer<typeof meatYieldSettingsSchema>;
