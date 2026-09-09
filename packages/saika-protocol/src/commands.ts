// SPDX-License-Identifier: MIT
import { z } from 'zod';

import { AthleteSchema } from './LaneAssignment';
import { MalfunctionFiringRequestSchema } from './MalfunctionFiring';
import { QualificationRecoveryFiringAuthorizationSchema } from './QualificationRecovery';
import { ReserveLaneTransferActionSchema } from './ReserveLaneTransfer';

/** Lane accepts legacy empty issuer labels; Director requires a label when sending. */
export function createCommandSchemas(issuedBySchema: z.ZodString = z.string().min(1)) {
  const CommandBaseSchema = z.object({
    commandId: z.string().uuid(),
    issuedBy: issuedBySchema,
    /** Stable application principal; issuedBy may identify the authorizing official. */
    issuerId: z.string().min(1).optional(),
    issuedAt: z.string().datetime(),
  });

  const JoinCompetitionCommandSchema = CommandBaseSchema.extend({
    competitionId: z.string().uuid(),
  });

  const LeaveCompetitionCommandSchema = CommandBaseSchema.extend({
    competitionId: z.string().uuid(),
  });

  const ProbeClockCommandSchema = CommandBaseSchema.extend({
    directorSentAt: z.string().datetime(),
  });

  const ActivateSafetyStopCommandSchema = CommandBaseSchema.extend({
    safetyStopId: z.string().uuid(),
    reason: z.string().trim().min(1).max(500),
  });

  const ClearSafetyStopCommandSchema = CommandBaseSchema.extend({
    safetyStopId: z.string().uuid(),
    clearanceReason: z.string().trim().min(1).max(500),
    confirmedSafe: z.literal(true),
  });

  const StartSightingCommandSchema = CommandBaseSchema.extend({
    timerStartAt: z.string().datetime(),
    timerDurationSeconds: z.number().int().positive(),
    targetLaneIds: z.array(z.string().uuid()).optional(),
  });

  const EndSightingCommandSchema = CommandBaseSchema;

  const StartMatchCommandSchema = CommandBaseSchema.extend({
    timerStartAt: z.string().datetime(),
    timerDurationSeconds: z.number().int().positive().optional(),
  });

  const TimerStartedCommandSchema = CommandBaseSchema.extend({
    timerScope: z.enum(['STAGE', 'SERIES']),
    timerStartAt: z.string().datetime(),
    timerDurationSeconds: z.number().int().positive(),
    stageIndex: z.number().int().min(0),
    seriesIndex: z.number().int().min(0).nullable(),
  });

  const TimerExpiredCommandSchema = CommandBaseSchema.extend({
    timerScope: z.enum(['STAGE', 'SERIES']),
    stageIndex: z.number().int().min(0),
    seriesIndex: z.number().int().min(0).nullable(),
    expiredAt: z.string().datetime(),
  });

  const AdvanceSeriesCommandSchema = CommandBaseSchema.extend({
    stageIndex: z.number().int().min(0),
    fromSeriesIndex: z.number().int().min(0),
    resumeOnly: z.boolean().optional(),
    timerStartAt: z.string().datetime().optional(),
    timerDurationSeconds: z.number().int().positive().optional(),
  });

  const FinishCompetitionCommandSchema = CommandBaseSchema;

  const AssignAthleteCommandSchema = CommandBaseSchema.extend({
    athlete: AthleteSchema.nullable(),
  });

  const ResetSessionCommandSchema = CommandBaseSchema.extend({
    reason: z.string().optional(),
  });

  const PauseTimerCommandSchema = CommandBaseSchema.extend({
    interruptionId: z.string().uuid(),
    pausedAt: z.string().datetime(),
  });

  const ResumeTimerCommandSchema = CommandBaseSchema.extend({
    interruptionId: z.string().uuid(),
    timerStartAt: z.string().datetime(),
    authorizedRemainingSeconds: z.number().int().positive(),
    unlimitedSightingShots: z.boolean(),
  });

  const ResumeMatchCommandSchema = CommandBaseSchema.extend({
    interruptionId: z.string().uuid(),
  });

  const StartQualificationRecoveryCommandSchema = CommandBaseSchema.extend({
    runId: z.string().uuid(),
    decisionId: z.string().uuid(),
    interruptionId: z.string().uuid(),
    stageIndex: z.number().int().nonnegative(),
    seriesIndex: z.number().int().nonnegative(),
    expectedMatchProgramId: z.string().trim().min(1).max(200),
    expectedSeriesShotLimit: z.number().int().positive(),
    expectedRecordedShots: z.number().int().nonnegative(),
    authorization: QualificationRecoveryFiringAuthorizationSchema,
    loadAt: z.string().datetime(),
    officialName: z.string().trim().min(1).max(200),
    decisionRuleReference: z.string().trim().min(1).max(500),
    decidedAt: z.string().datetime(),
  }).superRefine((command, context) => {
    if (command.expectedRecordedShots > command.expectedSeriesShotLimit) {
      context.addIssue({
        code: 'custom',
        path: ['expectedRecordedShots'],
        message: 'expectedRecordedShots must not exceed expectedSeriesShotLimit',
      });
    }
  });

  const CancelQualificationRecoveryCommandSchema = CommandBaseSchema.extend({
    runId: z.string().uuid(),
    reason: z.string().trim().min(1).max(500),
  });

  const ApplyQualificationRecoveryCommandSchema = CommandBaseSchema.extend({
    runId: z.string().uuid(),
    appliedBy: z.string().trim().min(1).max(200),
    statement: z.string().trim().min(1).max(1_000),
    appliedAt: z.string().datetime(),
  });

  const SettleQualificationRecoveryCommandSchema = CommandBaseSchema.extend({
    decisionId: z.string().uuid(),
    interruptionId: z.string().uuid(),
    stageIndex: z.number().int().nonnegative(),
    seriesIndex: z.number().int().nonnegative(),
    expectedMatchProgramId: z.string().trim().min(1).max(200),
    expectedSeriesShotLimit: z.number().int().positive(),
    expectedRecordedShots: z.number().int().nonnegative(),
    treatment: z.literal('KEEP_RECORDED_SERIES'),
    decisionOfficialName: z.string().trim().min(1).max(200),
    decisionRuleReference: z.string().trim().min(1).max(500),
    decidedAt: z.string().datetime(),
    appliedBy: z.string().trim().min(1).max(200),
    statement: z.string().trim().min(1).max(1_000),
    appliedAt: z.string().datetime(),
  }).superRefine((command, context) => {
    if (command.expectedRecordedShots !== command.expectedSeriesShotLimit) {
      context.addIssue({
        code: 'custom',
        path: ['expectedRecordedShots'],
        message: 'KEEP_RECORDED_SERIES requires every series shot to be recorded',
      });
    }
  });

  const RetireFinalistCommandSchema = CommandBaseSchema.extend({
    checkpointId: z.string().uuid(),
    rank: z.number().int().min(2).max(99),
    afterShot: z.number().int().positive(),
  });

  const StartShootOffCommandSchema = CommandBaseSchema.extend({
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

  const StopShootOffCommandSchema = CommandBaseSchema.extend({
    runId: z.string().uuid(),
    iteration: z.number().int().positive(),
    targetLaneIds: z.array(z.string().uuid()).min(2),
  });

  const StartTimedTargetCommandSchema = CommandBaseSchema.extend({
    programId: z.string().min(1),
    purpose: z.enum(['SIGHTING', 'MATCH']),
    stageIndex: z.number().int().nonnegative(),
    seriesIndex: z.number().int().nonnegative(),
    loadAt: z.string().datetime(),
    targetLaneIds: z.array(z.string().uuid()).min(1).optional(),
  });

  const RecordTimedTargetUnloadCommandSchema = CommandBaseSchema.extend({
    sequenceId: z.string().uuid(),
    observedAt: z.string().datetime(),
    officialName: z.string().trim().min(1).max(200),
    targetLaneIds: z.array(z.string().uuid()).min(1),
  });

  const CancelTimedTargetCommandSchema = CommandBaseSchema.extend({
    sequenceId: z.string().uuid(),
    reason: z.string().trim().min(1).max(500),
    targetLaneIds: z.array(z.string().uuid()).min(1).optional(),
  });

  const ReserveLaneTransferCommandSchema = CommandBaseSchema.extend({ transfer: ReserveLaneTransferActionSchema });

  const StartMalfunctionFiringCommandSchema = CommandBaseSchema.extend({ request: MalfunctionFiringRequestSchema });

  const ReadMalfunctionFiringCommandSchema = CommandBaseSchema.extend({ runId: z.string().uuid() });

  const CancelMalfunctionFiringCommandSchema = CommandBaseSchema.extend({
    request: MalfunctionFiringRequestSchema.optional(),
    runId: z.string().uuid(),
    reason: z.string().trim().min(1).max(500),
  });

  return {
    CommandBaseSchema,
    JoinCompetitionCommandSchema,
    LeaveCompetitionCommandSchema,
    ProbeClockCommandSchema,
    ActivateSafetyStopCommandSchema,
    ClearSafetyStopCommandSchema,
    StartSightingCommandSchema,
    EndSightingCommandSchema,
    StartMatchCommandSchema,
    TimerStartedCommandSchema,
    TimerExpiredCommandSchema,
    AdvanceSeriesCommandSchema,
    FinishCompetitionCommandSchema,
    AssignAthleteCommandSchema,
    ResetSessionCommandSchema,
    PauseTimerCommandSchema,
    ResumeTimerCommandSchema,
    ResumeMatchCommandSchema,
    StartQualificationRecoveryCommandSchema,
    CancelQualificationRecoveryCommandSchema,
    ApplyQualificationRecoveryCommandSchema,
    SettleQualificationRecoveryCommandSchema,
    RetireFinalistCommandSchema,
    StartShootOffCommandSchema,
    StopShootOffCommandSchema,
    StartTimedTargetCommandSchema,
    RecordTimedTargetUnloadCommandSchema,
    CancelTimedTargetCommandSchema,
    ReserveLaneTransferCommandSchema,
    StartMalfunctionFiringCommandSchema,
    ReadMalfunctionFiringCommandSchema,
    CancelMalfunctionFiringCommandSchema,
  };
}

export const {
  CommandBaseSchema,
  JoinCompetitionCommandSchema,
  LeaveCompetitionCommandSchema,
  ProbeClockCommandSchema,
  ActivateSafetyStopCommandSchema,
  ClearSafetyStopCommandSchema,
  StartSightingCommandSchema,
  EndSightingCommandSchema,
  StartMatchCommandSchema,
  TimerStartedCommandSchema,
  TimerExpiredCommandSchema,
  AdvanceSeriesCommandSchema,
  FinishCompetitionCommandSchema,
  AssignAthleteCommandSchema,
  ResetSessionCommandSchema,
  PauseTimerCommandSchema,
  ResumeTimerCommandSchema,
  ResumeMatchCommandSchema,
  StartQualificationRecoveryCommandSchema,
  CancelQualificationRecoveryCommandSchema,
  ApplyQualificationRecoveryCommandSchema,
  SettleQualificationRecoveryCommandSchema,
  RetireFinalistCommandSchema,
  StartShootOffCommandSchema,
  StopShootOffCommandSchema,
  StartTimedTargetCommandSchema,
  RecordTimedTargetUnloadCommandSchema,
  CancelTimedTargetCommandSchema,
  ReserveLaneTransferCommandSchema,
  StartMalfunctionFiringCommandSchema,
  ReadMalfunctionFiringCommandSchema,
  CancelMalfunctionFiringCommandSchema,
} = createCommandSchemas();

export type ProbeClockCommand = z.infer<typeof ProbeClockCommandSchema>;
