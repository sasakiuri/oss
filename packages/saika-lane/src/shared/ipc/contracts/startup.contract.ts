// SPDX-License-Identifier: MIT
import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const StartupStateSchema = z.object({
  status: z.enum(['READY', 'ERROR']),
  error: z.string().nullable(),
  competitionId: z.string().nullable(),
  sessionId: z.string().nullable(),
  currentSeriesStartIndex: z.number().int().nonnegative(),
  canFinish: z.boolean(),
});

export const startupContract = defineContract('startup', {
  getStartupState: query(queryResponseSchema(StartupStateSchema), { channel: 'query:getStartupState' }),
  retryStartup: command(commandDataResponseSchema(StartupStateSchema), { channel: 'command:retryStartup' }),
});

export type StartupStateDto = z.infer<typeof StartupStateSchema>;
