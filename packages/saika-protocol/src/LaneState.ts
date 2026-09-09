// SPDX-License-Identifier: MIT
import { z } from 'zod';

import { RulePackIdentitySchema } from './CompetitionState';
import { ShotTimingSettingsSchema } from './ShotTimingSettings';
import { TimingEvidenceReportSchema } from './TimingEvidenceReport';

export const LanePhaseSchema = z.enum([
  'OFFLINE',
  'READY',
  'SIGHTING',
  'SIGHTING_COMPLETE',
  'MATCH',
  'SERIES_COMPLETE',
  'STAGE_COMPLETE',
  'FINISHED',
]);

export const HardwareStatePayloadSchema = z.object({
  laneId: z.string().uuid(),
  laneAlias: z.string(),
  connection: z.object({
    status: z.enum(['connected', 'disconnected', 'offline']),
    manufacturer: z.string().optional(),
    deviceId: z.string().min(1).nullable().optional(),
    portPath: z.string().optional(),
    connectionId: z.string().uuid().optional(),
  }),
  appVersion: z.string(),
  capabilities: z
    .object({
      competitionProtocolVersions: z.array(z.literal(1)).min(1),
      rulePacks: z.array(RulePackIdentitySchema),
      timingEvidence: TimingEvidenceReportSchema.optional(),
      timedTargetPolicy: z
        .object({
          enforcementMode: z.enum(['DISABLED', 'ADVISORY', 'REQUIRED']),
          shotTiming: ShotTimingSettingsSchema.optional(),
        })
        .optional(),
      targetIntegration: z
        .object({
          schemaVersion: z.literal(1),
          timedTarget: z.object({
            actuation: z.enum(['INTEGRATED', 'NOT_INTEGRATED']),
            feedback: z.enum(['INTEGRATED', 'NOT_INTEGRATED']),
          }),
        })
        .optional(),
    })
    .optional(),
  publishedAt: z.string().datetime(),
});

export const LaneSafetyStatePayloadSchema = z.object({
  laneId: z.string().uuid(),
  status: z.enum(['STOPPED', 'CLEAR']),
  safetyStopId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  stoppedBy: z.string().nullable(),
  stoppedAt: z.string().datetime().nullable(),
  timerSnapshot: z
    .object({
      competitionId: z.string().uuid(),
      remainingSeconds: z.number().int().nonnegative(),
      totalSeconds: z.number().int().nonnegative(),
      frozenAt: z.string().datetime(),
    })
    .nullable(),
  clearedBy: z.string().nullable(),
  clearanceReason: z.string().nullable(),
  clearedAt: z.string().datetime().nullable(),
  publishedAt: z.string().datetime(),
});

export const LaneCompetitionStatePayloadSchema = z.object({
  competitionId: z.string().uuid(),
  laneId: z.string().uuid(),
  sessionId: z.string().uuid(),
  phase: LanePhaseSchema,
  currentStage: z.object({
    index: z.number().int().min(0),
    name: z.string(),
    scored: z.boolean(),
    totalSeries: z.number().int().positive(),
  }),
  currentSeries: z.object({
    index: z.number().int().min(0),
    shotsRecorded: z.number().int().min(0),
    maxShots: z.number().int().min(0),
  }),
  awaitingSeriesStart: z.boolean().optional(),
  interruption: z
    .object({
      interruptionId: z.string().uuid(),
      status: z.enum(['PAUSED', 'RESUME_PENDING', 'SIGHTING', 'RUNNING_MATCH']),
      pausedAt: z.string().datetime(),
      capturedAt: z.string().datetime(),
      capturedRemainingSeconds: z.number().int().nonnegative(),
      capturedTotalSeconds: z.number().int().nonnegative(),
      resumeAt: z.string().datetime().nullable(),
      authorizedRemainingSeconds: z.number().int().nonnegative().nullable(),
      unlimitedSightingShots: z.boolean().nullable(),
    })
    .optional(),
  finalSnapshotCommandId: z.string().uuid().optional(),
  publishedAt: z.string().datetime(),
});

export type HardwareStatePayload = z.infer<typeof HardwareStatePayloadSchema>;
export type LaneSafetyStatePayload = z.infer<typeof LaneSafetyStatePayloadSchema>;
export type LaneCompetitionStatePayload = z.infer<typeof LaneCompetitionStatePayloadSchema>;
