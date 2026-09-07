// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const MalfunctionFiringRequestSchema = z.object({
  workflow: z.literal('FINAL_RECOVERY').optional(),
  finalIncident: z.enum(['MALFUNCTION', 'EST_FAILURE']).optional(),
  runId: z.string().uuid(),
  competitionId: z.string().uuid(),
  caseId: z.string().uuid(),
  authorizationId: z.string().uuid(),
  participantId: z.string().min(1),
  sessionId: z.string().uuid(),
  rulePackFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  stageIndex: z.number().int().nonnegative(),
  seriesIndex: z.number().int().nonnegative(),
  recordedShots: z.number().int().min(0).max(5),
  remedy: z.enum(['REPEAT_FULL_SERIES', 'COMPLETE_REMAINING_SHOTS']),
  shotsToFire: z.number().int().min(1).max(5),
  officialName: z.string().trim().min(1).max(200),
  decidedAt: z.string().datetime(),
  loadAt: z.string().datetime(),
});

export const MalfunctionFiringEvidenceSchema = z.object({
  request: MalfunctionFiringRequestSchema,
  status: z.enum(['RUNNING', 'COMPLETED', 'CANCELLED']),
  captureIssues: z.array(z.string()),
  terminalReason: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  targetProfileId: z.string().min(1).nullable(),
  shots: z
    .array(
      z.object({
        shotId: z.string().uuid(),
        observationId: z.string().uuid().nullable(),
        scoreX10: z.number().int().min(0).max(109),
        deviceScoreX10: z.number().int().min(0).max(109).nullable(),
        calculatedScoreX10: z.number().int().min(0).max(109),
        innerTen: z.boolean(),
        x: z.number().nullable(),
        y: z.number().nullable(),
        firedAt: z.string().datetime(),
        receivedAt: z.string().datetime(),
        eligible: z.boolean(),
        reviewReason: z.string().nullable(),
      }),
    )
    .max(1000),
});

export type MalfunctionFiringRequestPayload = z.infer<typeof MalfunctionFiringRequestSchema>;
export type MalfunctionFiringEvidencePayload = z.infer<typeof MalfunctionFiringEvidenceSchema>;
