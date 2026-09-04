// SPDX-License-Identifier: MIT
import { z } from 'zod';

const TimedTargetExecutionContextSchema = z.object({
  shotDisposition: z.literal('ISOLATED'),
  owner: z.string().trim().min(1).max(100),
  referenceId: z.string().trim().min(1).max(200),
});

export const TimedTargetStateSchema = z.object({
  sequenceId: z.string().uuid(),
  competitionId: z.string().uuid(),
  programId: z.string().min(1),
  programLabel: z.string().min(1),
  purpose: z.enum(['SIGHTING', 'MATCH', 'SHOOT_OFF']),
  stageIndex: z.number().int().nonnegative(),
  seriesIndex: z.number().int().nonnegative(),
  targetProfileId: z.string().min(1),
  ruleReference: z.string().min(1),
  phase: z.enum(['ARMED', 'LOAD', 'ATTENTION', 'FIRING', 'AFTER_TIME', 'BETWEEN_EXPOSURES', 'COMPLETE', 'CANCELLED']),
  signal: z.enum(['RED', 'GREEN']),
  shotWindowOpen: z.boolean(),
  exposureIndex: z.number().int().nonnegative().nullable(),
  exposureCount: z.number().int().positive(),
  acceptedShotsInExposure: z.number().int().nonnegative(),
  loadAt: z.string().datetime(),
  attentionAt: z.string().datetime(),
  completesAt: z.string().datetime(),
  nextLoadAllowedAt: z.string().datetime(),
  nextTransitionAt: z.string().datetime().nullable(),
  terminalReason: z.string().nullable(),
  commandPause: z
    .object({
      mode: z.enum(['DISABLED', 'ADVISORY', 'REQUIRED']),
      ruleReference: z.string().min(1),
      minimumSeconds: z.number().positive(),
      unloadAt: z.string().datetime().nullable(),
      officialName: z.string().nullable(),
      nextLoadAllowedAt: z.string().datetime().nullable(),
      blocked: z.boolean(),
    })
    .optional(),

  executionContext: TimedTargetExecutionContextSchema.optional(),
});

export const TimedTargetStatePayloadSchema = TimedTargetStateSchema.extend({
  schemaVersion: z.literal(1),
  laneId: z.string().uuid(),
  enforcementMode: z.enum(['DISABLED', 'ADVISORY', 'REQUIRED']),
  publishedAt: z.string().datetime(),
});

export type TimedTargetStateDto = z.infer<typeof TimedTargetStateSchema>;
export type TimedTargetStatePayload = z.infer<typeof TimedTargetStatePayloadSchema>;
