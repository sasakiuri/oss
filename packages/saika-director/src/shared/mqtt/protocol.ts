// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const CompetitionPhaseSchema = z.enum([
  'NOT_STARTED',
  'SIGHTING',
  'SIGHTING_COMPLETE',
  'MATCH',
  'MATCH_COMPLETE',
]);

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
    portPath: z.string().optional(),
    connectionId: z.string().uuid().optional(),
  }),
  appVersion: z.string(),
  publishedAt: z.string().datetime(),
});

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
  innerTen: z.boolean(),
  mode: z.enum(['SIGHTING', 'MATCH']),
  timestamp: z.string().datetime(),
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
  finalSnapshotCommandId: z.string().uuid().optional(),
  publishedAt: z.string().datetime(),
});

export const AthleteSchema = z.object({
  startNumber: z.number().int().positive(),
  id: z.string(),
  name: z.string(),
  teamName: z.string().optional(),
  issfCode: z.string().optional(),
});

export const LaneAssignmentPayloadSchema = z.object({
  competitionId: z.string().uuid(),
  laneId: z.string().uuid(),
  athlete: AthleteSchema.nullable(),
  assignedAt: z.string().datetime().nullable(),
  publishedAt: z.string().datetime(),
});

const SeriesScoreSchema = z.object({
  seriesIndex: z.number().int().min(0),
  shots: z.array(z.number().int().min(0).max(109)),
  seriesTotalX10: z.number().int().min(0),
  isComplete: z.boolean(),
});

export const LaneScorePayloadSchema = z
  .object({
    competitionId: z.string().uuid(),
    laneId: z.string().uuid(),
    sessionId: z.string().uuid(),
    totalScoreX10: z.number().int().min(0),
    totalShotCount: z.number().int().min(0),
    acc: z.enum(['RING', 'DECIMAL']),
    stages: z.array(
      z.object({
        stageIndex: z.number().int().min(0),
        stageName: z.string(),
        stageTotalX10: z.number().int().min(0),
        series: z.array(SeriesScoreSchema),
      }),
    ),
    finalSnapshotCommandId: z.string().uuid().optional(),
    publishedAt: z.string().datetime(),
  })
  .superRefine((score, context) => {
    const stageIndices = new Set<number>();
    let declaredTotalX10 = 0;
    let recordedShotCount = 0;

    score.stages.forEach((stage, stagePosition) => {
      if (stageIndices.has(stage.stageIndex)) {
        context.addIssue({
          code: 'custom',
          path: ['stages', stagePosition, 'stageIndex'],
          message: `Duplicate stageIndex ${stage.stageIndex}`,
        });
      }
      stageIndices.add(stage.stageIndex);

      const seriesIndices = new Set<number>();
      let declaredStageTotalX10 = 0;
      stage.series.forEach((series, seriesPosition) => {
        if (seriesIndices.has(series.seriesIndex)) {
          context.addIssue({
            code: 'custom',
            path: ['stages', stagePosition, 'series', seriesPosition, 'seriesIndex'],
            message: `Duplicate seriesIndex ${series.seriesIndex}`,
          });
        }
        seriesIndices.add(series.seriesIndex);

        const shotTotalX10 = series.shots.reduce((sum, shot) => sum + shot, 0);
        if (series.seriesTotalX10 !== shotTotalX10) {
          context.addIssue({
            code: 'custom',
            path: ['stages', stagePosition, 'series', seriesPosition, 'seriesTotalX10'],
            message: `seriesTotalX10 must equal the shot total ${shotTotalX10}`,
          });
        }
        if (score.acc === 'RING') {
          series.shots.forEach((shot, shotPosition) => {
            if (shot % 10 !== 0) {
              context.addIssue({
                code: 'custom',
                path: ['stages', stagePosition, 'series', seriesPosition, 'shots', shotPosition],
                message: 'RING shot scores must be whole points in x10 representation',
              });
            }
          });
        }

        recordedShotCount += series.shots.length;
        declaredStageTotalX10 += series.seriesTotalX10;
      });

      if (stage.stageTotalX10 !== declaredStageTotalX10) {
        context.addIssue({
          code: 'custom',
          path: ['stages', stagePosition, 'stageTotalX10'],
          message: `stageTotalX10 must equal the series total ${declaredStageTotalX10}`,
        });
      }
      declaredTotalX10 += stage.stageTotalX10;
    });

    if (score.totalScoreX10 !== declaredTotalX10) {
      context.addIssue({
        code: 'custom',
        path: ['totalScoreX10'],
        message: `totalScoreX10 must equal the stage total ${declaredTotalX10}`,
      });
    }
    if (score.totalShotCount !== recordedShotCount) {
      context.addIssue({
        code: 'custom',
        path: ['totalShotCount'],
        message: `totalShotCount must equal the recorded shot count ${recordedShotCount}`,
      });
    }
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

const CommandBaseSchema = z.object({
  commandId: z.string().uuid(),
  issuedBy: z.string().min(1),
  issuedAt: z.string().datetime(),
});

export const JoinCompetitionCommandSchema = CommandBaseSchema.extend({
  competitionId: z.string().uuid(),
});

export const LeaveCompetitionCommandSchema = CommandBaseSchema.extend({
  competitionId: z.string().uuid(),
});

export const StartSightingCommandSchema = CommandBaseSchema.extend({
  timerStartAt: z.string().datetime(),
  timerDurationSeconds: z.number().int().positive(),
  targetLaneIds: z.array(z.string().uuid()).optional(),
});

export const EndSightingCommandSchema = CommandBaseSchema;

export const StartMatchCommandSchema = CommandBaseSchema.extend({
  timerStartAt: z.string().datetime(),
  timerDurationSeconds: z.number().int().positive(),
});

export const TimerStartedCommandSchema = CommandBaseSchema.extend({
  timerScope: z.enum(['STAGE', 'SERIES']),
  timerStartAt: z.string().datetime(),
  timerDurationSeconds: z.number().int().positive(),
  stageIndex: z.number().int().min(0),
  seriesIndex: z.number().int().min(0).nullable(),
});

export const TimerExpiredCommandSchema = CommandBaseSchema.extend({
  timerScope: z.enum(['STAGE', 'SERIES']),
  stageIndex: z.number().int().min(0),
  seriesIndex: z.number().int().min(0).nullable(),
  expiredAt: z.string().datetime(),
});

export const AdvanceSeriesCommandSchema = CommandBaseSchema.extend({
  stageIndex: z.number().int().min(0),
  fromSeriesIndex: z.number().int().min(0),
  resumeOnly: z.boolean().optional(),
  timerStartAt: z.string().datetime().optional(),
});

export const FinishCompetitionCommandSchema = CommandBaseSchema;

export const AssignAthleteCommandSchema = CommandBaseSchema.extend({
  athlete: AthleteSchema.nullable(),
});

export const ResetSessionCommandSchema = CommandBaseSchema.extend({
  reason: z.string().optional(),
});

export const CommandAcknowledgementSchema = z.object({
  commandId: z.string().uuid(),
  laneId: z.string().uuid(),
  status: z.enum(['executing', 'done', 'error']),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  warning: z.string().optional(),
  acknowledgedAt: z.string().datetime(),
});

export type CompetitionPhase = z.infer<typeof CompetitionPhaseSchema>;
export type HardwareStatePayload = z.infer<typeof HardwareStatePayloadSchema>;
export type RawShotPayload = z.infer<typeof RawShotPayloadSchema>;
export type ActiveCompetitionTimer = z.infer<typeof ActiveCompetitionTimerSchema>;
export type CompetitionStatePayload = z.infer<typeof CompetitionStatePayloadSchema>;
export type PendingCompetitionTimer = z.infer<typeof PendingCompetitionTimerSchema>;
export type LaneCompetitionStatePayload = z.infer<typeof LaneCompetitionStatePayloadSchema>;
export type Athlete = z.infer<typeof AthleteSchema>;
export type LaneAssignmentPayload = z.infer<typeof LaneAssignmentPayloadSchema>;
export type LaneScorePayload = z.infer<typeof LaneScorePayloadSchema>;
export type CompetitionShotPayload = z.infer<typeof CompetitionShotPayloadSchema>;
export type CommandAcknowledgement = z.infer<typeof CommandAcknowledgementSchema>;
