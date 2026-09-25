import { z } from 'zod';

export const FREEZER_MAX_ITEMS = 300;
export const FREEZER_MAX_TEXT = 40;

/** A calendar date as `<input type="date">` gives it, or empty. */
const dateText = z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/);

export const freezerSpeciesSchema = z.enum(['deer', 'boar', 'other']);
export type FreezerSpecies = z.infer<typeof freezerSpeciesSchema>;

/**
 * One line of the freezer: packs of the same cut frozen on the same day. Weights are per pack, so taking
 * a pack out only lowers the count.
 */
export const freezerItemSchema = z.object({
  id: z.string().min(1).max(64),
  species: freezerSpeciesSchema,
  cut: z.string().max(FREEZER_MAX_TEXT),
  gramsPerPack: z.number().finite().nonnegative().nullable(),
  packs: z.number().int().nonnegative().max(9999),
  frozenOn: dateText,
  /** A use-by date the reader sets, from the facility's label or their own rule. The tool sets none. */
  useBy: dateText,
  note: z.string().max(FREEZER_MAX_TEXT),
});
export type FreezerItem = z.infer<typeof freezerItemSchema>;
