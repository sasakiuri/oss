// SPDX-License-Identifier: MIT
/**
 * MQTT Competition State Schemas
 *
 * @description
 * Zod-based schemas for competition state payloads received via MQTT.
 * Used by CompetitionStateSubscriber to validate incoming messages.
 */

import { z } from 'zod';

// ============================================================
// Competition State Payload Schema
// ============================================================

/** Validation schema for CompetitionStatePayload published by the Director */
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
  definitionBinding: CompetitionDefinitionBindingSchema.optional(),
  acc: z.enum(['RING', 'DECIMAL']),
  phase: CompetitionPhaseSchema,
  shotsPerSeries: z.number().int().positive(),
  totalSeries: z.number().int().positive(),
  totalShots: z.number().int().positive(),
  laneIds: z.array(z.string().uuid()),
  pendingJoinLaneIds: z.array(z.string().uuid()).optional(),
  pendingSightingLaneIds: z.array(z.string().uuid()).optional(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  activeTimer: ActiveCompetitionTimerSchema.optional(),
  pendingTimer: PendingCompetitionTimerSchema.optional(),
  cleanupPreparedAt: z.string().datetime().optional(),
  publishedAt: z.string().datetime(),
});

// ============================================================
// Type Exports
// ============================================================

export type CompetitionStatePayload = z.infer<typeof CompetitionStatePayloadSchema>;
