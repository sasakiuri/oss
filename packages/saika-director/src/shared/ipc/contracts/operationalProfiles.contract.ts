import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';
import { OperationalModeSchema as mode, OperationalModesSchema as modes } from './operationalSettings.schema';

const selection = z.object({
  competitionId: z.string().uuid(),
  modes,
});
const preview = z.object({
  competitionId: z.string().uuid(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  presets: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string(),
        modes,
        issues: z.array(z.string()),
      }),
    )
    .optional(),
  changes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      scope: z.enum(['COMPETITION', 'DIRECTOR']),
      supportedModes: z.array(mode).min(1).max(3).optional(),
      before: mode,
      after: mode,
      context: z.string(),
    }),
  ),
});
const result = z.object({
  complete: z.boolean(),
  results: z.array(
    z.object({ id: z.string(), status: z.enum(['APPLIED', 'UNCHANGED', 'FAILED']), message: z.string() }),
  ),
});
export type OperationalProfilePreviewDto = z.infer<typeof preview>;
export type OperationalProfileResultDto = z.infer<typeof result>;
export type OperationalProfileMode = z.infer<typeof mode>;
export const operationalProfilesContract = defineContract('operationalProfiles', {
  preview: query(selection, queryResponseSchema(preview)),
  apply: command(
    selection.extend({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }),
    commandDataResponseSchema(result),
  ),
});
