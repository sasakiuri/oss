import { z } from 'zod';

export const ShotTimingSettingsSchema = z.object({
  mode: z.enum(['BOUNDED', 'TIMESTAMP']),
  maximumReceiptDelayMilliseconds: z.number().int().nonnegative().max(60_000).nullable(),
  clockUncertaintyMilliseconds: z.number().int().nonnegative().max(60_000).nullable(),
});

export type ShotTimingSettings = z.infer<typeof ShotTimingSettingsSchema>;
