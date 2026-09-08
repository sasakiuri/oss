import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

export const BackupCaptureReadinessSettingsSchema = z.object({
  competitionId: z.string().uuid(),
  eventId: z.string().uuid().nullable(),
  mode: z.enum(['DISABLED', 'ADVISORY', 'REQUIRED']),
  maximumAgeMilliseconds: z.number().int().min(1000).max(3_600_000),
});
export type BackupCaptureReadinessSettings = z.infer<typeof BackupCaptureReadinessSettingsSchema>;
const assessment = z.object({
  settings: BackupCaptureReadinessSettingsSchema,
  revision: z.string(),
  health: z.object({
    state: z.enum(['DISABLED', 'UNBOUND', 'HEALTHY', 'STOPPED', 'ERROR', 'WAITING', 'STALE']),
    issues: z.array(z.string()),
  }),
});
export type BackupCaptureReadinessDto = z.infer<typeof assessment>;
export const backupCaptureReadinessContract = defineContract('backupCaptureReadiness', {
  get: query(z.object({ competitionId: z.string().uuid() }), queryResponseSchema(assessment)),
  save: command(
    BackupCaptureReadinessSettingsSchema.extend({ expectedRevision: z.string() }),
    commandDataResponseSchema(assessment),
  ),
  sources: query(z.void(), queryResponseSchema(z.array(z.object({ eventId: z.string().uuid(), label: z.string() })))),
});
