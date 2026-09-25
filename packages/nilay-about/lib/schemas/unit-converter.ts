import { z } from 'zod';

import { UNIT_QUANTITIES, UNIT_QUANTITY_IDS, type UnitQuantity } from '../unit-converter';

export const unitQuantitySchema = z.enum(UNIT_QUANTITY_IDS as [UnitQuantity, ...UnitQuantity[]]);

/** One value per quantity, so switching between pressure and torque keeps what was typed in each. */
const entrySchema = z.object({ value: z.number().finite(), unit: z.string() });

export const unitConverterSettingsSchema = z
  .object({
    quantity: unitQuantitySchema,
    entries: z.object(
      Object.fromEntries(UNIT_QUANTITY_IDS.map((quantity) => [quantity, entrySchema])) as Record<
        UnitQuantity,
        typeof entrySchema
      >,
    ),
  })
  .superRefine((settings, context) => {
    for (const quantity of UNIT_QUANTITY_IDS) {
      const units: Record<string, unknown> = UNIT_QUANTITIES[quantity];
      if (!Object.hasOwn(units, settings.entries[quantity].unit))
        context.addIssue({
          code: 'custom',
          path: ['entries', quantity, 'unit'],
          message: 'The unit has to be one of the units of its quantity.',
        });
    }
  });
export type UnitConverterSettings = z.infer<typeof unitConverterSettingsSchema>;
