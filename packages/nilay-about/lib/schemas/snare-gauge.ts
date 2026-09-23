import { z } from 'zod';

import { isSnareGaugeSize, isSnarePrefectureCode, type SnareGaugeSizeMm } from '@/lib/snare-gauge';

export const snareTargetSpeciesSchema = z.enum(['boar', 'deer', 'other']);

export const snareGaugeSettingsSchema = z.object({
  // A code the data no longer carries is rejected, so the tool never shows a prefecture it cannot find.
  prefecture: z.string().refine(isSnarePrefectureCode),
  species: snareTargetSpeciesSchema,
  gaugeMm: z
    .number()
    .refine((value): value is SnareGaugeSizeMm => isSnareGaugeSize(value))
    .transform((value) => value as SnareGaugeSizeMm),
});
export type SnareGaugeSettings = z.infer<typeof snareGaugeSettingsSchema>;
