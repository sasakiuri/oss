import { z } from 'zod';

/**
 * A weight, a price or a percentage as entered. `null` is a field left empty. A value out of range is
 * kept as typed and marked on the screen; the calculation leaves it out.
 */
const amount = z.number().finite().nullable();
const percent = amount;

export const CURE_MIX_MAX_INGREDIENTS = 12;
export const CURE_MIX_MAX_NAME = 40;

export const cureMixIngredientSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(CURE_MIX_MAX_NAME),
  /** Percent of the basis weight, as a recipe states it. */
  percent,
  /** Yen per kilogram, for the cost. */
  pricePerKg: amount,
});
export type CureMixIngredient = z.infer<typeof cureMixIngredientSchema>;

/**
 * What the percentages are taken of: the meat alone, as for a dry cure or a sausage, or the meat and
 * the water together, as for an equilibrium brine.
 */
export const cureMixBasisSchema = z.enum(['meat', 'meatAndWater']);
export type CureMixBasis = z.infer<typeof cureMixBasisSchema>;

/** How the curing agent's label gives its nitrite: as sodium nitrite, or as nitrite (亜硝酸根). */
export const nitriteExpressedAsSchema = z.enum(['sodiumNitrite', 'nitrite']);
export type NitriteExpressedAs = z.infer<typeof nitriteExpressedAsSchema>;

export const cureMixSettingsSchema = z.object({
  leanG: amount,
  fatG: amount,
  waterG: amount,
  basis: cureMixBasisSchema,
  saltPercent: percent,
  /** Whether a nitrite curing agent is used at all. */
  useCure: z.boolean(),
  curePercent: percent,
  cureNitritePercent: percent,
  cureExpressedAs: nitriteExpressedAsSchema,
  /** The salt in the curing agent, which counts towards the salt. */
  cureSaltPercent: percent,
  ingredients: z.array(cureMixIngredientSchema).max(CURE_MIX_MAX_INGREDIENTS),
  leanPricePerKg: amount,
  fatPricePerKg: amount,
  saltPricePerKg: amount,
  curePricePerKg: amount,
  /** Grams of mix per link, for the count of links. */
  linkG: amount,
  /** Grams of mix one metre of the casing holds, as the casing's maker or the reader's own fill gives it. */
  casingGPerM: amount,
  casingPricePerM: amount,
});
export type CureMixSettings = z.infer<typeof cureMixSettingsSchema>;
