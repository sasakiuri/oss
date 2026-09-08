import { z } from 'zod';

import { ShotTimingSettingsSchema } from './ShotTimingSettings';

/** Evidence facts are separate from the consumer's choice to require them. */
export const TimingEvidenceReportSchema = z.object({
  state: z.enum(['VERIFIED', 'INCOMPLETE', 'INVALID']),
  profileId: z.string().uuid().nullable(),
  measuredAt: z.string().datetime().nullable(),
  validUntil: z.string().datetime().nullable(),
  installationRevision: z.string().uuid().nullable(),
  measurementSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  connection: z.object({ manufacturer: z.string(), deviceId: z.string(), portPath: z.string() }).nullable(),
  settings: ShotTimingSettingsSchema,
  issues: z.array(z.string()).max(20),
});
export type TimingEvidenceReport = z.infer<typeof TimingEvidenceReportSchema>;
