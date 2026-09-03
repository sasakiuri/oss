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
  capabilities: z
    .object({
      competitionProtocolVersions: z.array(z.literal(1)).min(1),
      rulePacks: z.array(RulePackIdentitySchema),
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

export const RangeOfficerRequestPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    laneId: z.string().uuid(),
    status: z.enum(['ACTIVE', 'CLEARED']),
    requestId: z.string().uuid().nullable(),
    category: z.enum(['ASSISTANCE', 'EQUIPMENT', 'TARGET', 'SCORING', 'SAFETY', 'OTHER']).nullable(),
    message: z.string().max(500).nullable(),
    requestedAt: z.string().datetime().nullable(),
    clearedAt: z.string().datetime().nullable(),
    clearedBy: z.string().nullable(),
    publishedAt: z.string().datetime(),
  })
  .superRefine((state, context) => {
    if (state.status === 'ACTIVE') {
      if (!state.requestId || !state.category || !state.requestedAt) {
        context.addIssue({ code: 'custom', message: 'An active request requires identity, category and time' });
      }
      if (state.clearedAt || state.clearedBy) {
        context.addIssue({ code: 'custom', message: 'An active request cannot contain clearance data' });
      }
    } else if (state.requestId && (!state.category || !state.requestedAt || !state.clearedAt || !state.clearedBy)) {
      context.addIssue({ code: 'custom', message: 'A cleared request history is incomplete' });
    }
  });

export const TimedTargetStatePayloadSchema = z.object({
  schemaVersion: z.literal(1),
  laneId: z.string().uuid(),
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
  enforcementMode: z.enum(['DISABLED', 'ADVISORY', 'REQUIRED']),
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
    'QUARANTINED_SAFETY_STOP',
    'NO_ACTIVE_SESSION',
    'PROCESSING_FAILED',
  ]),
  x: z.number().nullable(),
  y: z.number().nullable(),
  deviceScoreX10: z.number().min(0).max(109).nullable(),
  firedAt: z.string().datetime(),
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
  pendingJoinLaneIds: z.array(z.string().uuid()).optional(),
  pendingSightingLaneIds: z.array(z.string().uuid()).optional(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  activeTimer: ActiveCompetitionTimerSchema.optional(),
  pendingTimer: PendingCompetitionTimerSchema.optional(),
  cleanupPreparedAt: z.string().datetime().optional(),
  publishedAt: z.string().datetime(),
});

/**
 * Retained, presentation-only instruction for joined Lanes. State-changing
 * actions continue to use acknowledged command topics; a cue can therefore be
 * replaced or ignored without changing competition state.
 */
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
    type: z.enum(['NONE', 'LOAD', 'OPEN_FIRING', 'RUN_TIMED_TARGET', 'CLOSE_FIRING', 'CHECKPOINT', 'DECLARE_RESULTS']),
    purpose: z.enum(['SIGHTING', 'MATCH', 'SHOOT_OFF']).optional(),
  }),
  targetLaneIds: z.array(z.string().uuid()).min(1).optional(),
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

export const AthleteSchema = z.object({
  startNumber: z.number().int().positive(),
  id: z.string(),
  name: z.string(),
  teamName: z.string().optional(),
  teamId: z.string().optional(),
  gender: z.enum(['M', 'F', 'X', 'UNSPECIFIED']).optional(),
  nationCode: z.string().optional(),
  issfCode: z.string().optional(),
});

export const LaneAssignmentPayloadSchema = z.object({
  competitionId: z.string().uuid(),
  laneId: z.string().uuid(),
  athlete: AthleteSchema.nullable(),
  assignedAt: z.string().datetime().nullable(),
  publishedAt: z.string().datetime(),
});

const HitMissResultProjectionSchema = z.object({
  type: z.literal('HIT_MISS'),
  source: z.literal('EFFECTIVE_SCORE_X10'),
  hitThresholdX10: z.number().int().min(0).max(109),
  hitValueX10: z.literal(10),
  missValueX10: z.literal(0),
  displayUnit: z.literal('HITS'),
  preserveSourceScore: z.literal(true),
  ruleReference: z.string().min(1),
});

const SeriesScoreSchema = z.object({
  seriesIndex: z.number().int().min(0),
  shots: z.array(z.number().int().min(0).max(109)),
  seriesTotalX10: z.number().int().min(0),
  isComplete: z.boolean(),
  sourceShotsX10: z.array(z.number().int().min(0).max(109)).optional(),
  sourceSeriesTotalX10: z.number().int().min(0).optional(),
});

export const LaneScorePayloadSchema = z
  .object({
    competitionId: z.string().uuid(),
    laneId: z.string().uuid(),
    sessionId: z.string().uuid(),
    totalScoreX10: z.number().int().min(0),
    totalShotCount: z.number().int().min(0),
    acc: z.enum(['RING', 'DECIMAL']),
    resultProjection: HitMissResultProjectionSchema.optional(),
    sourceTotalScoreX10: z.number().int().min(0).optional(),
    stages: z.array(
      z.object({
        stageIndex: z.number().int().min(0),
        stageName: z.string(),
        stageTotalX10: z.number().int().min(0),
        sourceStageTotalX10: z.number().int().min(0).optional(),
        series: z.array(SeriesScoreSchema),
      }),
    ),
    finalSnapshotCommandId: z.string().uuid().optional(),
    publishedAt: z.string().datetime(),
  })
  .superRefine((score, context) => {
    const stageIndices = new Set<number>();
    let declaredTotalX10 = 0;
    let declaredSourceTotalX10 = 0;
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
      let declaredSourceStageTotalX10 = 0;
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

        if (score.resultProjection) {
          if (!series.sourceShotsX10 || series.sourceSeriesTotalX10 === undefined) {
            context.addIssue({
              code: 'custom',
              path: ['stages', stagePosition, 'series', seriesPosition],
              message: 'Projected score series must preserve its source shots and total',
            });
          } else {
            if (series.sourceShotsX10.length !== series.shots.length) {
              context.addIssue({
                code: 'custom',
                path: ['stages', stagePosition, 'series', seriesPosition, 'sourceShotsX10'],
                message: 'sourceShotsX10 must contain one value for every result shot',
              });
            }
            const sourceShotTotalX10 = series.sourceShotsX10.reduce((sum, shot) => sum + shot, 0);
            if (series.sourceSeriesTotalX10 !== sourceShotTotalX10) {
              context.addIssue({
                code: 'custom',
                path: ['stages', stagePosition, 'series', seriesPosition, 'sourceSeriesTotalX10'],
                message: `sourceSeriesTotalX10 must equal the source shot total ${sourceShotTotalX10}`,
              });
            }
            series.shots.forEach((shot, shotPosition) => {
              const sourceShot = series.sourceShotsX10?.[shotPosition];
              if (sourceShot === undefined) return;
              const expected =
                sourceShot >= score.resultProjection!.hitThresholdX10
                  ? score.resultProjection!.hitValueX10
                  : score.resultProjection!.missValueX10;
              if (shot !== expected) {
                context.addIssue({
                  code: 'custom',
                  path: ['stages', stagePosition, 'series', seriesPosition, 'shots', shotPosition],
                  message: `Projected shot must equal ${expected} for source score ${sourceShot}`,
                });
              }
            });
            declaredSourceStageTotalX10 += series.sourceSeriesTotalX10;
          }
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
      if (score.resultProjection && stage.sourceStageTotalX10 !== declaredSourceStageTotalX10) {
        context.addIssue({
          code: 'custom',
          path: ['stages', stagePosition, 'sourceStageTotalX10'],
          message: `sourceStageTotalX10 must equal the source series total ${declaredSourceStageTotalX10}`,
        });
      }
      declaredTotalX10 += stage.stageTotalX10;
      declaredSourceTotalX10 += declaredSourceStageTotalX10;
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
    if (score.resultProjection) {
      if (score.acc !== 'DECIMAL') {
        context.addIssue({
          code: 'custom',
          path: ['acc'],
          message: 'HIT_MISS result projection requires DECIMAL source scoring',
        });
      }
      if (score.sourceTotalScoreX10 !== declaredSourceTotalX10) {
        context.addIssue({
          code: 'custom',
          path: ['sourceTotalScoreX10'],
          message: `sourceTotalScoreX10 must equal the source stage total ${declaredSourceTotalX10}`,
        });
      }
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

/**
 * A one-shot Final tie-break observation. It deliberately uses a dedicated
 * topic and payload so the shot cannot change the normal MATCH aggregate.
 */
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

const CommandBaseSchema = z.object({
  commandId: z.string().uuid(),
  issuedBy: z.string().min(1),
  /** Stable application principal; issuedBy may identify the authorizing official. */
  issuerId: z.string().min(1).optional(),
  issuedAt: z.string().datetime(),
});

export const JoinCompetitionCommandSchema = CommandBaseSchema.extend({
  competitionId: z.string().uuid(),
});

export const LeaveCompetitionCommandSchema = CommandBaseSchema.extend({
  competitionId: z.string().uuid(),
});

export const ProbeClockCommandSchema = CommandBaseSchema.extend({
  directorSentAt: z.string().datetime(),
});

export const ActivateSafetyStopCommandSchema = CommandBaseSchema.extend({
  safetyStopId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

export const ClearSafetyStopCommandSchema = CommandBaseSchema.extend({
  safetyStopId: z.string().uuid(),
  clearanceReason: z.string().trim().min(1).max(500),
  confirmedSafe: z.literal(true),
});

export const StartSightingCommandSchema = CommandBaseSchema.extend({
  timerStartAt: z.string().datetime(),
  timerDurationSeconds: z.number().int().positive(),
  targetLaneIds: z.array(z.string().uuid()).optional(),
});

export const EndSightingCommandSchema = CommandBaseSchema;

export const StartMatchCommandSchema = CommandBaseSchema.extend({
  timerStartAt: z.string().datetime(),
  timerDurationSeconds: z.number().int().positive().optional(),
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
  timerDurationSeconds: z.number().int().positive().optional(),
});

export const FinishCompetitionCommandSchema = CommandBaseSchema;

export const AssignAthleteCommandSchema = CommandBaseSchema.extend({
  athlete: AthleteSchema.nullable(),
});

export const ResetSessionCommandSchema = CommandBaseSchema.extend({
  reason: z.string().optional(),
});

export const PauseTimerCommandSchema = CommandBaseSchema.extend({
  interruptionId: z.string().uuid(),
  pausedAt: z.string().datetime(),
});

export const ResumeTimerCommandSchema = CommandBaseSchema.extend({
  interruptionId: z.string().uuid(),
  timerStartAt: z.string().datetime(),
  authorizedRemainingSeconds: z.number().int().positive(),
  unlimitedSightingShots: z.boolean(),
});

export const ResumeMatchCommandSchema = CommandBaseSchema.extend({
  interruptionId: z.string().uuid(),
});

export const RetireFinalistCommandSchema = CommandBaseSchema.extend({
  checkpointId: z.string().uuid(),
  rank: z.number().int().min(2).max(99),
  afterShot: z.number().int().positive(),
});

export const StartShootOffCommandSchema = CommandBaseSchema.extend({
  runId: z.string().uuid(),
  iteration: z.number().int().positive(),
  timerStartAt: z.string().datetime(),
  timerDurationSeconds: z.number().int().positive().optional(),
  shotsPerLane: z.number().int().positive(),
  targetLaneIds: z.array(z.string().uuid()).min(2),
  timedTarget: z
    .object({
      programId: z.string().min(1),
      participantExecution: z.enum(['SIMULTANEOUS', 'SEQUENTIAL']),
    })
    .optional(),
}).superRefine((command, context) => {
  if ((command.timerDurationSeconds === undefined) === (command.timedTarget === undefined)) {
    context.addIssue({
      code: 'custom',
      path: ['timerDurationSeconds'],
      message: 'A shoot-off requires exactly one generic duration or timed-target program',
    });
  }
});

export const StopShootOffCommandSchema = CommandBaseSchema.extend({
  runId: z.string().uuid(),
  iteration: z.number().int().positive(),
  targetLaneIds: z.array(z.string().uuid()).min(2),
});

export const StartTimedTargetCommandSchema = CommandBaseSchema.extend({
  programId: z.string().min(1),
  purpose: z.enum(['SIGHTING', 'MATCH']),
  stageIndex: z.number().int().nonnegative(),
  seriesIndex: z.number().int().nonnegative(),
  loadAt: z.string().datetime(),
  targetLaneIds: z.array(z.string().uuid()).min(1).optional(),
});

export const CancelTimedTargetCommandSchema = CommandBaseSchema.extend({
  sequenceId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  targetLaneIds: z.array(z.string().uuid()).min(1).optional(),
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
  data: z.record(z.string(), z.unknown()).optional(),
  acknowledgedAt: z.string().datetime(),
});

export const ClockProbeAcknowledgementDataSchema = z.object({
  directorSentAt: z.string().datetime(),
  laneReceivedAt: z.string().datetime(),
  laneSentAt: z.string().datetime(),
});

export type CompetitionPhase = z.infer<typeof CompetitionPhaseSchema>;
export type RulePackIdentityPayload = z.infer<typeof RulePackIdentitySchema>;
export type CompetitionDefinitionBinding = z.infer<typeof CompetitionDefinitionBindingSchema>;
export type HardwareStatePayload = z.infer<typeof HardwareStatePayloadSchema>;
export type LaneSafetyStatePayload = z.infer<typeof LaneSafetyStatePayloadSchema>;
export type RangeOfficerRequestPayload = z.infer<typeof RangeOfficerRequestPayloadSchema>;
export type TimedTargetStatePayload = z.infer<typeof TimedTargetStatePayloadSchema>;
export type RawShotPayload = z.infer<typeof RawShotPayloadSchema>;
export type ShotObservationEvidencePayload = z.infer<typeof ShotObservationEvidencePayloadSchema>;
export type ActiveCompetitionTimer = z.infer<typeof ActiveCompetitionTimerSchema>;
export type CompetitionStatePayload = z.infer<typeof CompetitionStatePayloadSchema>;
export type CompetitionCuePayload = z.infer<typeof CompetitionCuePayloadSchema>;
export type PendingCompetitionTimer = z.infer<typeof PendingCompetitionTimerSchema>;
export type LaneCompetitionStatePayload = z.infer<typeof LaneCompetitionStatePayloadSchema>;
export type Athlete = z.infer<typeof AthleteSchema>;
export type LaneAssignmentPayload = z.infer<typeof LaneAssignmentPayloadSchema>;
export type LaneScorePayload = z.infer<typeof LaneScorePayloadSchema>;
export type CompetitionShotPayload = z.infer<typeof CompetitionShotPayloadSchema>;
export type CompetitionShootOffShotPayload = z.infer<typeof CompetitionShootOffShotPayloadSchema>;
export type CommandAcknowledgement = z.infer<typeof CommandAcknowledgementSchema>;
export type ProbeClockCommand = z.infer<typeof ProbeClockCommandSchema>;
export type ClockProbeAcknowledgementData = z.infer<typeof ClockProbeAcknowledgementDataSchema>;
