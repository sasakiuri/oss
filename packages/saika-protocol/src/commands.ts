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

  return {
    CommandBaseSchema,
    JoinCompetitionCommandSchema: CommandBaseSchema.extend({
      competitionId: z.string().uuid(),
    }),
    LeaveCompetitionCommandSchema: CommandBaseSchema.extend({
      competitionId: z.string().uuid(),
    }),
    ProbeClockCommandSchema: CommandBaseSchema.extend({
      directorSentAt: z.string().datetime(),
    }),
    ActivateSafetyStopCommandSchema: CommandBaseSchema.extend({
      safetyStopId: z.string().uuid(),
      reason: z.string().trim().min(1).max(500),
    }),
    ClearSafetyStopCommandSchema: CommandBaseSchema.extend({
      safetyStopId: z.string().uuid(),
      clearanceReason: z.string().trim().min(1).max(500),
      confirmedSafe: z.literal(true),
    }),
    StartSightingCommandSchema: CommandBaseSchema.extend({
      timerStartAt: z.string().datetime(),
      timerDurationSeconds: z.number().int().positive(),
      targetLaneIds: z.array(z.string().uuid()).optional(),
    }),
    EndSightingCommandSchema: CommandBaseSchema,
    StartMatchCommandSchema: CommandBaseSchema.extend({
      timerStartAt: z.string().datetime(),
      timerDurationSeconds: z.number().int().positive().optional(),
    }),
    TimerStartedCommandSchema: CommandBaseSchema.extend({
      timerScope: z.enum(['STAGE', 'SERIES']),
      timerStartAt: z.string().datetime(),
      timerDurationSeconds: z.number().int().positive(),
      stageIndex: z.number().int().min(0),
      seriesIndex: z.number().int().min(0).nullable(),
    }),
    TimerExpiredCommandSchema: CommandBaseSchema.extend({
      timerScope: z.enum(['STAGE', 'SERIES']),
      stageIndex: z.number().int().min(0),
      seriesIndex: z.number().int().min(0).nullable(),
      expiredAt: z.string().datetime(),
    }),
    AdvanceSeriesCommandSchema: CommandBaseSchema.extend({
      stageIndex: z.number().int().min(0),
      fromSeriesIndex: z.number().int().min(0),
      resumeOnly: z.boolean().optional(),
      timerStartAt: z.string().datetime().optional(),
      timerDurationSeconds: z.number().int().positive().optional(),
    }),
    FinishCompetitionCommandSchema: CommandBaseSchema,
    AssignAthleteCommandSchema: CommandBaseSchema.extend({
      athlete: AthleteSchema.nullable(),
    }),
    ResetSessionCommandSchema: CommandBaseSchema.extend({
      reason: z.string().optional(),
    }),
    PauseTimerCommandSchema: CommandBaseSchema.extend({
      interruptionId: z.string().uuid(),
      pausedAt: z.string().datetime(),
    }),
    ResumeTimerCommandSchema: CommandBaseSchema.extend({
      interruptionId: z.string().uuid(),
      timerStartAt: z.string().datetime(),
      authorizedRemainingSeconds: z.number().int().positive(),
      unlimitedSightingShots: z.boolean(),
    }),
    ResumeMatchCommandSchema: CommandBaseSchema.extend({
      interruptionId: z.string().uuid(),
    }),
    StartQualificationRecoveryCommandSchema: CommandBaseSchema.extend({
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
    }),
    CancelQualificationRecoveryCommandSchema: CommandBaseSchema.extend({
      runId: z.string().uuid(),
      reason: z.string().trim().min(1).max(500),
    }),
    ApplyQualificationRecoveryCommandSchema: CommandBaseSchema.extend({
      runId: z.string().uuid(),
      appliedBy: z.string().trim().min(1).max(200),
      statement: z.string().trim().min(1).max(1_000),
      appliedAt: z.string().datetime(),
    }),
    SettleQualificationRecoveryCommandSchema: CommandBaseSchema.extend({
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
    }),
    RetireFinalistCommandSchema: CommandBaseSchema.extend({
      checkpointId: z.string().uuid(),
      rank: z.number().int().min(2).max(99),
      afterShot: z.number().int().positive(),
    }),
    StartShootOffCommandSchema: CommandBaseSchema.extend({
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
    }),
    StopShootOffCommandSchema: CommandBaseSchema.extend({
      runId: z.string().uuid(),
      iteration: z.number().int().positive(),
      targetLaneIds: z.array(z.string().uuid()).min(2),
    }),
    StartTimedTargetCommandSchema: CommandBaseSchema.extend({
      programId: z.string().min(1),
      purpose: z.enum(['SIGHTING', 'MATCH']),
      stageIndex: z.number().int().nonnegative(),
      seriesIndex: z.number().int().nonnegative(),
      loadAt: z.string().datetime(),
      targetLaneIds: z.array(z.string().uuid()).min(1).optional(),
    }),
    RecordTimedTargetUnloadCommandSchema: CommandBaseSchema.extend({
      sequenceId: z.string().uuid(),
      observedAt: z.string().datetime(),
      officialName: z.string().trim().min(1).max(200),
      targetLaneIds: z.array(z.string().uuid()).min(1),
    }),
    CancelTimedTargetCommandSchema: CommandBaseSchema.extend({
      sequenceId: z.string().uuid(),
      reason: z.string().trim().min(1).max(500),
      targetLaneIds: z.array(z.string().uuid()).min(1).optional(),
    }),
    ReserveLaneTransferCommandSchema: CommandBaseSchema.extend({ transfer: ReserveLaneTransferActionSchema }),
    StartMalfunctionFiringCommandSchema: CommandBaseSchema.extend({ request: MalfunctionFiringRequestSchema }),
    ReadMalfunctionFiringCommandSchema: CommandBaseSchema.extend({ runId: z.string().uuid() }),
    CancelMalfunctionFiringCommandSchema: CommandBaseSchema.extend({
      request: MalfunctionFiringRequestSchema.optional(),
      runId: z.string().uuid(),
      reason: z.string().trim().min(1).max(500),
    }),
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

type CommandSchemas = ReturnType<typeof createCommandSchemas>;
type CommandSchemaName = Exclude<keyof CommandSchemas, 'CommandBaseSchema'>;

/**
 * Where a command is addressed: `lane` uses `mqttTopics.laneCommand`, `competition` uses
 * `mqttTopics.competitionCommand` and `competition-lane` uses `mqttTopics.laneCompetitionCommand`.
 */
export type MqttCommandScope = 'lane' | 'competition' | 'competition-lane';

/** Every released command action with its topic scope and payload schema. */
export const MQTT_COMMAND_ACTIONS = {
  'join-competition': { scope: 'lane', schema: 'JoinCompetitionCommandSchema' },
  'leave-competition': { scope: 'lane', schema: 'LeaveCompetitionCommandSchema' },
  'probe-clock': { scope: 'lane', schema: 'ProbeClockCommandSchema' },
  'activate-safety-stop': { scope: 'lane', schema: 'ActivateSafetyStopCommandSchema' },
  'clear-safety-stop': { scope: 'lane', schema: 'ClearSafetyStopCommandSchema' },
  'start-sighting': { scope: 'competition', schema: 'StartSightingCommandSchema' },
  'end-sighting': { scope: 'competition', schema: 'EndSightingCommandSchema' },
  'start-match': { scope: 'competition', schema: 'StartMatchCommandSchema' },
  'advance-series': { scope: 'competition', schema: 'AdvanceSeriesCommandSchema' },
  'finish-competition': { scope: 'competition', schema: 'FinishCompetitionCommandSchema' },
  'timer-started': { scope: 'competition', schema: 'TimerStartedCommandSchema' },
  'timer-expired': { scope: 'competition', schema: 'TimerExpiredCommandSchema' },
  'start-shoot-off': { scope: 'competition', schema: 'StartShootOffCommandSchema' },
  'stop-shoot-off': { scope: 'competition', schema: 'StopShootOffCommandSchema' },
  'start-timed-target': { scope: 'competition', schema: 'StartTimedTargetCommandSchema' },
  'cancel-timed-target': { scope: 'competition', schema: 'CancelTimedTargetCommandSchema' },
  'record-timed-target-unload': { scope: 'competition', schema: 'RecordTimedTargetUnloadCommandSchema' },
  'reserve-lane-transfer': { scope: 'competition-lane', schema: 'ReserveLaneTransferCommandSchema' },
  'start-malfunction-firing': { scope: 'competition-lane', schema: 'StartMalfunctionFiringCommandSchema' },
  'read-malfunction-firing': { scope: 'competition-lane', schema: 'ReadMalfunctionFiringCommandSchema' },
  'cancel-malfunction-firing': { scope: 'competition-lane', schema: 'CancelMalfunctionFiringCommandSchema' },
  'assign-athlete': { scope: 'competition-lane', schema: 'AssignAthleteCommandSchema' },
  'reset-session': { scope: 'competition-lane', schema: 'ResetSessionCommandSchema' },
  'pause-timer': { scope: 'competition-lane', schema: 'PauseTimerCommandSchema' },
  'resume-timer': { scope: 'competition-lane', schema: 'ResumeTimerCommandSchema' },
  'resume-match': { scope: 'competition-lane', schema: 'ResumeMatchCommandSchema' },
  'start-qualification-recovery': { scope: 'competition-lane', schema: 'StartQualificationRecoveryCommandSchema' },
  'cancel-qualification-recovery': { scope: 'competition-lane', schema: 'CancelQualificationRecoveryCommandSchema' },
  'apply-qualification-recovery': { scope: 'competition-lane', schema: 'ApplyQualificationRecoveryCommandSchema' },
  'settle-qualification-recovery': { scope: 'competition-lane', schema: 'SettleQualificationRecoveryCommandSchema' },
  'retire-finalist': { scope: 'competition-lane', schema: 'RetireFinalistCommandSchema' },
} as const satisfies Record<string, { scope: MqttCommandScope; schema: CommandSchemaName }>;

type CommandActionTable = typeof MQTT_COMMAND_ACTIONS;

export type MqttCommandAction = keyof CommandActionTable;

export type MqttCommandActionOf<Scope extends MqttCommandScope> = {
  [Action in MqttCommandAction]: CommandActionTable[Action]['scope'] extends Scope ? Action : never;
}[MqttCommandAction];

type CommandSchemasForScope<Scope extends MqttCommandScope> = {
  [Action in MqttCommandActionOf<Scope>]: CommandSchemas[CommandActionTable[Action]['schema']];
};

/** Picks, from one schema set, the payload schema of every action addressed through `scope`. */
export function commandSchemasForScope<Scope extends MqttCommandScope>(
  schemas: CommandSchemas,
  scope: Scope,
): CommandSchemasForScope<Scope> {
  const entries = Object.entries(MQTT_COMMAND_ACTIONS)
    .filter(([, command]) => command.scope === scope)
    .map(([action, command]) => [action, schemas[command.schema]]);
  return Object.fromEntries(entries) as CommandSchemasForScope<Scope>;
}
