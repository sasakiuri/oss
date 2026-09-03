// SPDX-License-Identifier: MIT
import { z } from 'zod';

const QualificationSeriesRecoverySchema = z.union([
  z.object({
    treatment: z.literal('ANNUL_AND_REPEAT'),
    shotsToFire: z.number().int().positive(),
    execution: z.object({ mode: z.literal('SAME_TIMED_TARGET_PROGRAM') }),
  }),
  z.object({
    treatment: z.literal('COMPLETE_REMAINING_SHOTS'),
    shotsToFire: z.number().int().positive(),
    execution: z.union([
      z.object({
        mode: z.literal('SECONDS_PER_SHOT'),
        secondsPerShot: z.number().int().positive(),
        totalSeconds: z.number().int().positive(),
      }),
      z.object({ mode: z.literal('FIRST_EXPOSURE_OF_NEXT_SERIES') }),
    ]),
  }),
]);

export const QualificationRecoveryFiringAuthorizationSchema = z
  .union([
    z.object({ phase: z.literal('EXTRA_SIGHTING'), shotsToFire: z.number().int().positive() }),
    z.object({ phase: z.literal('SERIES_RECOVERY'), seriesRecovery: QualificationSeriesRecoverySchema }),
  ])
  .superRefine((authorization, context) => {
    if (
      authorization.phase === 'SERIES_RECOVERY' &&
      authorization.seriesRecovery.treatment === 'COMPLETE_REMAINING_SHOTS' &&
      authorization.seriesRecovery.execution.mode === 'SECONDS_PER_SHOT' &&
      authorization.seriesRecovery.execution.totalSeconds !==
        authorization.seriesRecovery.execution.secondsPerShot * authorization.seriesRecovery.shotsToFire
    ) {
      context.addIssue({
        code: 'custom',
        path: ['seriesRecovery', 'execution', 'totalSeconds'],
        message: 'totalSeconds must equal secondsPerShot multiplied by shotsToFire',
      });
    }
  });

export const QualificationRecoveryStatePayloadSchema = z.object({
  schemaVersion: z.literal(1),
  laneId: z.string().uuid(),
  runId: z.string().uuid(),
  sequenceId: z.string().uuid(),
  decisionId: z.string().uuid(),
  interruptionId: z.string().uuid(),
  competitionId: z.string().uuid(),
  stageIndex: z.number().int().nonnegative(),
  seriesIndex: z.number().int().nonnegative(),
  expectedMatchProgramId: z.string().min(1),
  executionProgramId: z.string().min(1),
  expectedSeriesShotLimit: z.number().int().positive(),
  expectedRecordedShots: z.number().int().nonnegative(),
  authorization: QualificationRecoveryFiringAuthorizationSchema,
  targetProfileId: z.string().min(1),
  loadAt: z.string().datetime(),
  officialName: z.string().min(1),
  decisionRuleReference: z.string().min(1),
  decidedAt: z.string().datetime(),
  startedAt: z.string().datetime(),
  status: z.enum(['RUNNING', 'COMPLETED', 'CANCELLED']),
  terminalReason: z.string().nullable(),
  terminalAt: z.string().datetime().nullable(),
  shots: z.array(
    z.object({
      shotId: z.string().uuid(),
      observationId: z.string().uuid().nullable(),
      firedAt: z.string().datetime(),
      recordedAt: z.string().datetime(),
    }),
  ),
  publishedAt: z.string().datetime(),
});

export const QualificationRecoveryShotPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  laneId: z.string().uuid(),
  competitionId: z.string().uuid(),
  runId: z.string().uuid(),
  decisionId: z.string().uuid(),
  interruptionId: z.string().uuid(),
  phase: z.enum(['EXTRA_SIGHTING', 'SERIES_RECOVERY']),
  stageIndex: z.number().int().nonnegative(),
  seriesIndex: z.number().int().nonnegative(),
  shotId: z.string().uuid(),
  x: z.number().nullable(),
  y: z.number().nullable(),
  rawScoreX10: z.number().int().min(0).max(109),
  deviceScoreX10: z.number().int().min(0).max(109).nullable(),
  calculatedScoreX10: z.number().int().min(0).max(109),
  effectiveScoreX10: z.number().int().min(0).max(109),
  innerTen: z.boolean(),
  firedAt: z.string().datetime(),
  receivedAt: z.string().datetime(),
  observationId: z.string().uuid().optional(),
  targetProfileId: z.string().min(1).optional(),
  scoringGaugeProfileId: z.string().min(1).optional(),
  publishedAt: z.string().datetime(),
});

export type QualificationRecoveryFiringAuthorizationPayload = z.infer<
  typeof QualificationRecoveryFiringAuthorizationSchema
>;
export type QualificationRecoveryStatePayload = z.infer<typeof QualificationRecoveryStatePayloadSchema>;
export type QualificationRecoveryShotPayload = z.infer<typeof QualificationRecoveryShotPayloadSchema>;
