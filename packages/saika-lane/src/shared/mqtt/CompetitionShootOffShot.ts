// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const CompetitionShootOffShotPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  competitionId: z.string().uuid(),
  runId: z.string().uuid(),
  iteration: z.number().int().positive(),
  laneId: z.string().uuid(),
  shotId: z.string().uuid(),
  x: z.number().nullable(),
  y: z.number().nullable(),
  effectiveScoreX10: z.number().int().min(0).max(109),
  deviceScoreX10: z.number().int().min(0).max(109).nullable(),
  calculatedScoreX10: z.number().int().min(0).max(109),
  innerTen: z.boolean(),
  firedAt: z.string().datetime(),
  receivedAt: z.string().datetime(),
  observationId: z.string().uuid().optional(),
  targetProfileId: z.string().min(1).optional(),
  scoringGaugeProfileId: z.string().min(1).optional(),
  publishedAt: z.string().datetime(),
});

export type CompetitionShootOffShotPayload = z.infer<typeof CompetitionShootOffShotPayloadSchema>;
