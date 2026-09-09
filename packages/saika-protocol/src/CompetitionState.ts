// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const CompetitionPhaseSchema = z.enum([
  'NOT_STARTED',
  'SIGHTING',
  'SIGHTING_COMPLETE',
  'MATCH',
  'MATCH_COMPLETE',
]);

export const RulePackIdentitySchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(1),
  fingerprint: z.object({
    algorithm: z.literal('SHA-256'),
    value: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});

export const CompetitionDefinitionBindingSchema = z
  .object({
    protocolVersion: z.literal(1),
    compatibilityMode: z.enum(['DISABLED', 'ADVISORY', 'REQUIRED']),
    rulePack: RulePackIdentitySchema.optional(),
  })
  .superRefine((binding, context) => {
    if (binding.compatibilityMode === 'REQUIRED' && !binding.rulePack) {
      context.addIssue({
        code: 'custom',
        path: ['rulePack'],
        message: 'A required compatibility binding needs an exact Rule Pack identity',
      });
    }
  });

export const ActiveCompetitionTimerSchema = z.object({
  timerScope: z.enum(['STAGE', 'SERIES']),
  timerStartAt: z.string().datetime(),
  timerDurationSeconds: z.number().int().positive(),
  stageIndex: z.number().int().min(0),
  seriesIndex: z.number().int().min(0).nullable(),
});

export const PendingCompetitionTimerSchema = ActiveCompetitionTimerSchema.extend({
  action: z.enum(['start-sighting', 'start-match', 'timer-started']),
});

export const CompetitionStatePayloadSchema = z.object({
  competitionId: z.string().uuid(),
  competitionTypeId: z.string(),
  competitionTypeName: z.string(),
  discipline: z.string(),
  roundName: z.string(),
  competitionUnit: z.enum(['INDIVIDUAL', 'MIXED_TEAM']).optional(),
  definitionBinding: CompetitionDefinitionBindingSchema.optional(),
  acc: z.enum(['RING', 'DECIMAL']),
  phase: CompetitionPhaseSchema,
  shotsPerSeries: z.number().int().positive(),
  totalSeries: z.number().int().positive(),
  totalShots: z.number().int().positive(),
  laneIds: z.array(z.string().uuid()),
  transferredSourceLaneIds: z.array(z.string().uuid()).optional(),
  pendingJoinLaneIds: z.array(z.string().uuid()).optional(),
  pendingSightingLaneIds: z.array(z.string().uuid()).optional(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  activeTimer: ActiveCompetitionTimerSchema.optional(),
  pendingTimer: PendingCompetitionTimerSchema.optional(),
  cleanupPreparedAt: z.string().datetime().optional(),
  publishedAt: z.string().datetime(),
});

export type CompetitionPhase = z.infer<typeof CompetitionPhaseSchema>;
export type RulePackIdentityPayload = z.infer<typeof RulePackIdentitySchema>;
export type CompetitionDefinitionBinding = z.infer<typeof CompetitionDefinitionBindingSchema>;
export type ActiveCompetitionTimer = z.infer<typeof ActiveCompetitionTimerSchema>;
export type CompetitionStatePayload = z.infer<typeof CompetitionStatePayloadSchema>;
export type PendingCompetitionTimer = z.infer<typeof PendingCompetitionTimerSchema>;
