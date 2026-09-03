// SPDX-License-Identifier: MIT
import { z } from 'zod';

import { TimedTargetStateSchema } from '@/shared/mqtt/TimedTargetState';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

export const timedTargetContract = defineContract('timedTarget', {
  getState: query(queryResponseSchema(TimedTargetStateSchema.nullable())),
  cancel: command(
    z.object({ sequenceId: z.string().uuid(), reason: z.string().trim().min(1).max(500) }),
    commandDataResponseSchema(TimedTargetStateSchema),
  ),
});

export type TimedTargetStateDto = z.infer<typeof TimedTargetStateSchema>;
