// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const RawShotPayloadSchema = z.object({
  laneId: z.string().uuid(),
  shotId: z.string().uuid(),
  x: z.number().nullable(),
  y: z.number().nullable(),
  /** @deprecated Backwards-compatible alias of effectiveScoreX10. */
  rawScoreX10: z.number().int().min(0).max(109),
  deviceScoreX10: z.number().int().min(0).max(109).nullable().optional(),
  calculatedScoreX10: z.number().int().min(0).max(109).optional(),
  effectiveScoreX10: z.number().int().min(0).max(109).optional(),
  observationId: z.string().uuid().optional(),
  receivedAt: z.string().datetime().optional(),
  targetProfileId: z.string().min(1).optional(),
  scoringGaugeProfileId: z.string().min(1).optional(),
  innerTen: z.boolean(),
  mode: z.enum(['SIGHTING', 'MATCH']),
  timestamp: z.string().datetime(),
});

export const ShotObservationEvidencePayloadSchema = z.object({
  evidenceVersion: z.literal(1),
  evidenceId: z.string().uuid(),
  observationId: z.string().uuid(),
  outcomeId: z.string().uuid(),
  laneId: z.string().uuid(),
  outcome: z.enum([
    'RECORDED',
    'REJECTED_COMPETITION_PHASE',
    'REJECTED_TIMED_TARGET_WINDOW',
    'QUARANTINED_TIMING_REVIEW',
    'QUARANTINED_SAFETY_STOP',
    'NO_ACTIVE_SESSION',
    'PROCESSING_FAILED',
  ]),
  x: z.number().nullable(),
  y: z.number().nullable(),
  deviceScoreX10: z.number().min(0).max(109).nullable(),
  firedAt: z.string().datetime(),
  // Missing on older Lane versions; omission means unknown provenance.
  timestampSource: z.enum(['LANE_RECEIPT', 'DEVICE_REPORTED', 'UNKNOWN']).optional(),
  receivedAt: z.string().datetime(),
  reportedMode: z.enum(['SIGHTING', 'MATCH']).nullable(),
  rawFrameHex: z
    .string()
    .regex(/^[0-9a-f]*$/i)
    .nullable(),
  decidedAt: z.string().datetime(),
  sessionId: z.string().uuid().nullable(),
  detail: z.string().nullable(),
  competition: z
    .object({
      competitionId: z.string().uuid(),
      phase: z.enum(['IDLE', 'ACTIVE', 'SERIES_COMPLETE', 'SERIES_ENTERED', 'STAGE_ENTERED', 'FINISHED']),
      stageIndex: z.number().int().nonnegative(),
      seriesIndex: z.number().int().nonnegative(),
      stageScored: z.boolean(),
    })
    .nullable(),
  publishedAt: z.string().datetime(),
});

export const CompetitionShotPayloadSchema = RawShotPayloadSchema.extend({
  competitionId: z.string().uuid(),
  sessionId: z.string().uuid(),
  stageIndex: z.number().int().min(0),
  scored: z.boolean(),
  seriesIndex: z.number().int().min(0),
  shotNumberInSeries: z.number().int().positive(),
  isRecorded: z.boolean(),
  isReplay: z.boolean(),
  publishedAt: z.string().datetime(),
});

export type RawShotPayload = z.infer<typeof RawShotPayloadSchema>;
export type ShotObservationEvidencePayload = z.infer<typeof ShotObservationEvidencePayloadSchema>;
export type CompetitionShotPayload = z.infer<typeof CompetitionShotPayloadSchema>;
