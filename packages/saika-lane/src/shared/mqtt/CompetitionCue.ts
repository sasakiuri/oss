// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const CompetitionCuePayloadSchema = z.object({
  schemaVersion: z.literal(1),
  competitionId: z.string().uuid(),
  runId: z.string().uuid(),
  cueId: z.string().uuid(),
  confirmationEntryId: z.string().uuid(),
  branch: z.enum(['MAIN', 'SHOOT_OFF']),
  iteration: z.number().int().nonnegative(),
  stepId: z.string().min(1),
  actor: z.enum(['OFFICIAL', 'CRO', 'ANNOUNCER']),
  kind: z.enum(['CHECK', 'COMMAND', 'ANNOUNCEMENT', 'DECLARATION']),
  text: z.string().min(1),
  ruleReference: z.string().min(1),
  effect: z.object({
    type: z.enum(['NONE', 'LOAD', 'OPEN_FIRING', 'CLOSE_FIRING', 'CHECKPOINT', 'DECLARE_RESULTS']),
    purpose: z.enum(['SIGHTING', 'MATCH', 'SHOOT_OFF']).optional(),
  }),
  targetLaneIds: z.array(z.string().uuid()).min(1).optional(),
  publishedAt: z.string().datetime(),
});

export type CompetitionCuePayload = z.infer<typeof CompetitionCuePayloadSchema>;
