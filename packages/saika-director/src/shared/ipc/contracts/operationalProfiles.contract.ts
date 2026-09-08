import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const mode = z.enum(['DISABLED', 'ADVISORY', 'REQUIRED']);
const selection = z.object({
  competitionId: z.string().uuid(),
  modes: z.record(z.string().min(1).max(100), mode).refine((value) => Object.keys(value).length <= 100),
});
const preview = z.object({
  competitionId: z.string().uuid(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  changes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      scope: z.enum(['COMPETITION', 'DIRECTOR']),
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
