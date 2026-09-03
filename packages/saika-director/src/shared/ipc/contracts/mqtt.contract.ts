import { z } from 'zod';
import {
  AthleteSchema,
  CompetitionShotPayloadSchema,
  CompetitionStatePayloadSchema,
  HardwareStatePayloadSchema,
  LaneAssignmentPayloadSchema,
  LaneCompetitionStatePayloadSchema,
  LaneSafetyStatePayloadSchema,
  RangeOfficerRequestPayloadSchema,
  TimedTargetStatePayloadSchema,
  LaneScorePayloadSchema,
  RawShotPayloadSchema,
  ShotObservationEvidencePayloadSchema,
} from '@/shared/mqtt';
import { MqttBrokerUrlSchema } from '@/shared/config/AppConfigSchema';

import {
  CommandResponseSchema,
  command,
  commandDataResponseSchema,
  defineContract,
  query,
  queryResponseSchema,
} from '../defineContract';
import { FinalOperationScriptStepDtoSchema } from './finalOperations.contract';

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

const BrokerConfigSchema = z.object({
  mode: z.enum(['embedded', 'external']),
  url: MqttBrokerUrlSchema,
  port: z.number().int().min(1).max(65535),
});

export const SetBrokerConfigPayloadSchema = z
  .object({
    mode: z.enum(['embedded', 'external']),
    url: MqttBrokerUrlSchema.optional(),
    port: z.number().int().min(1).max(65535).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'external' && value.url === undefined) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'External broker mode requires a broker URL' });
    }
  });

const BrokerStatusSchema = z.object({
  brokerRunning: z.boolean(),
  clientConnected: z.boolean(),
  brokerPort: z.number(),
  localAddresses: z.array(z.string()),
});

const LaneCommandResultSchema = z.object({
  laneId: z.string().uuid(),
  status: z.enum(['done', 'error', 'timeout']),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
  warning: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  acknowledgedAt: z.string().datetime().optional(),
});

const CommandExecutionResultSchema = z.object({
  commandId: z.string().uuid(),
  action: z.enum([
    'join-competition',
    'activate-safety-stop',
    'clear-safety-stop',
    'leave-competition',
    'start-sighting',
    'end-sighting',
    'start-match',
    'timer-started',
    'timer-expired',
    'advance-series',
    'finish-competition',
    'assign-athlete',
    'reset-session',
    'pause-timer',
    'resume-timer',
    'resume-match',
    'retire-finalist',
    'start-shoot-off',
    'stop-shoot-off',
    'start-timed-target',
    'cancel-timed-target',
    'probe-clock',
  ]),
  success: z.boolean(),
  lanes: z.array(LaneCommandResultSchema),
  resultPublication: z
    .object({
      savedCount: z.number().int().min(0),
      errors: z.array(z.string()),
    })
    .optional(),
});

const CommandBatchResultSchema = z.object({
  success: z.boolean(),
  commands: z.array(CommandExecutionResultSchema),
});

const SafetyStopAuditEntrySchema = z.object({
  id: z.string().uuid(),
  safetyStopId: z.string().uuid(),
  operation: z.enum(['ACTIVATE', 'CLEAR']),
  targetLaneIds: z.array(z.string().uuid()).min(1),
  success: z.boolean(),
  reason: z.string(),
  officialName: z.string(),
  occurredAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
  laneOutcomes: z.array(
    z.object({
      laneId: z.string().uuid(),
      status: z.enum(['done', 'error', 'timeout']),
      errorCode: z.string().nullable(),
      errorMessage: z.string().nullable(),
      acknowledgedAt: z.string().datetime().nullable(),
    }),
  ),
});

const DirectorLaneSnapshotSchema = z.object({
  laneId: z.string().uuid(),
  laneAlias: z.string(),
  firingPointNumber: z.number().int().min(1).max(99).nullable(),
  hardware: HardwareStatePayloadSchema.nullable(),
  safetyState: LaneSafetyStatePayloadSchema.nullable().optional(),
  rangeOfficerRequest: RangeOfficerRequestPayloadSchema.nullable().optional(),
  timedTargetState: TimedTargetStatePayloadSchema.nullable().optional(),
  competitionState: LaneCompetitionStatePayloadSchema.nullable(),
  assignment: LaneAssignmentPayloadSchema.nullable(),
  score: LaneScorePayloadSchema.nullable(),
  lastRawShot: RawShotPayloadSchema.nullable(),
  lastCompetitionShot: CompetitionShotPayloadSchema.nullable(),
  lastSeenAt: z.string().datetime(),
});

export const MqttControlSnapshotSchema = z.object({
  connected: z.boolean(),
  brokerUrl: z.string().nullable(),
  activeCompetitionId: z.string().uuid().nullable(),
  lanes: z.array(DirectorLaneSnapshotSchema),
  competitions: z.array(CompetitionStatePayloadSchema),
  lastCommand: CommandExecutionResultSchema.nullable(),
});

export const FiringWindowViolationDtoSchema = z.object({
  id: z.string().uuid(),
  competitionId: z.string().uuid(),
  laneId: z.string().uuid(),
  sessionId: z.string().uuid(),
  shotId: z.string().uuid(),
  observationId: z.string().uuid(),
  shotMode: z.enum(['SIGHTING', 'MATCH']),
  policyRuleId: z.string().min(1),
  kind: z.enum([
    'BEFORE_PREPARATION_AND_SIGHTING_START',
    'BETWEEN_PREPARATION_AND_SIGHTING_STOP_AND_MATCH_START',
    'AFTER_MATCH_STOP',
  ]),
  ruleReference: z.string().min(1),
  reviewGuidance: z.string().min(1),
  timestampSource: z.enum(['FIRED_AT', 'RECEIVED_AT', 'OBSERVED_AT']),
  clockToleranceMilliseconds: z.number().int().nonnegative(),
  evaluatedShotAt: z.string().datetime(),
  firedAt: z.string().datetime(),
  receivedAt: z.string().datetime(),
  observedAt: z.string().datetime(),
  decisiveBoundaryId: z.string().uuid(),
  detectedAt: z.string().datetime(),
});

export const ShotObservationEvidenceDtoSchema = ShotObservationEvidencePayloadSchema.extend({
  observedAt: z.string().datetime(),
});

const CompetitionAndLanesSchema = z.object({
  competitionId: z.string().uuid(),
  laneIds: z.array(z.string().uuid()).min(1),
});

const CompetitionSchema = z.object({ competitionId: z.string().uuid() });
const LaneSchema = z.object({ laneId: z.string().uuid() });

const ActivateSafetyStopSchema = z.object({
  safetyStopId: z.string().uuid(),
  laneIds: z.array(z.string().uuid()).min(1),
  reason: z.string().trim().min(1).max(500),
  officialName: z.string().trim().min(1).max(200),
});

const ClearSafetyStopSchema = z.object({
  safetyStopId: z.string().uuid(),
  laneIds: z.array(z.string().uuid()).min(1),
  clearanceReason: z.string().trim().min(1).max(500),
  officialName: z.string().trim().min(1).max(200),
  confirmedSafe: z.literal(true),
});

export const ClockQualityAssessmentDtoSchema = z.object({
  policyId: z.string().min(1),
  mode: z.enum(['DISABLED', 'ADVISORY', 'REQUIRED']),
  status: z.enum(['DISABLED', 'GOOD', 'DEGRADED', 'UNAVAILABLE']),
  offsetMilliseconds: z.number().nullable(),
  roundTripMilliseconds: z.number().nonnegative().nullable(),
  uncertaintyMilliseconds: z.number().nonnegative().nullable(),
  sampledAt: z.string().datetime(),
  maxAbsoluteOffsetMilliseconds: z.number().int().positive(),
  maxUncertaintyMilliseconds: z.number().int().positive(),
  maxSampleAgeMilliseconds: z.number().int().positive(),
  usableForTimedCommands: z.boolean(),
  guidance: z.string().min(1),
});

const LaneClockProbeResultSchema = z.object({
  command: CommandExecutionResultSchema,
  assessment: ClockQualityAssessmentDtoSchema,
});

const FinishCompetitionSchema = CompetitionSchema.extend({
  resultContext: z
    .object({
      eventId: z.string().uuid(),
      relayNumber: z.number().int().positive(),
    })
    .optional(),
});

const CreateCompetitionSchema = z.object({
  competitionTypeId: z.string().min(1),
  laneIds: z.array(z.string().uuid()).min(1),
});

const AssignAthleteSchema = z.object({
  competitionId: z.string().uuid(),
  laneId: z.string().uuid(),
  athlete: AthleteSchema.nullable(),
});

const ResetSessionSchema = z.object({
  competitionId: z.string().uuid(),
  laneId: z.string().uuid(),
  reason: z.string().optional(),
});

const InterruptionLaneSchema = z.object({
  competitionId: z.string().uuid(),
  laneId: z.string().uuid(),
  interruptionId: z.string().uuid(),
});

const ResumeLaneTimerSchema = InterruptionLaneSchema.extend({
  authorizedRemainingSeconds: z.number().int().positive(),
  unlimitedSightingShots: z.boolean(),
});

const InterruptionRangeSchema = z.object({
  competitionId: z.string().uuid(),
  laneIds: z.array(z.string().uuid()).min(1),
  interruptionId: z.string().uuid(),
});

const ResumeRangeTimersSchema = InterruptionRangeSchema.extend({
  authorizedRemainingSeconds: z.number().int().positive(),
  unlimitedSightingShots: z.boolean(),
});

const StartTimerPhaseSchema = z.object({
  competitionId: z.string().uuid(),
  durationSeconds: z.number().int().positive(),
});
const AcknowledgedRequirementIdsSchema = z.array(z.string().min(1).max(128)).max(32).optional();

const StartSightingSchema = StartTimerPhaseSchema.extend({
  targetLaneIds: z.array(z.string().uuid()).min(1).optional(),
  acknowledgedRequirementIds: AcknowledgedRequirementIdsSchema,
});

const StartMatchSchema = StartTimerPhaseSchema.extend({
  durationSeconds: z.number().int().positive().optional(),
  acknowledgedRequirementIds: AcknowledgedRequirementIdsSchema,
});

const StartTimedTargetSchema = z.object({
  competitionId: z.string().uuid(),
  programId: z.string().min(1),
  purpose: z.enum(['SIGHTING', 'MATCH']),
  stageIndex: z.number().int().nonnegative(),
  seriesIndex: z.number().int().nonnegative(),
  targetLaneIds: z.array(z.string().uuid()).min(1).optional(),
});

const CancelTimedTargetSchema = z.object({
  competitionId: z.string().uuid(),
  sequenceId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  targetLaneIds: z.array(z.string().uuid()).min(1).optional(),
});

const RestartTimerSchema = StartTimerPhaseSchema.extend({
  timerScope: z.enum(['STAGE', 'SERIES']),
  stageIndex: z.number().int().min(0),
  seriesIndex: z.number().int().min(0).nullable(),
});

const AdvanceSeriesSchema = z.object({
  competitionId: z.string().uuid(),
  stageIndex: z.number().int().min(0),
  fromSeriesIndex: z.number().int().min(0),
  resumeOnly: z.boolean().optional(),
});

const RetireFinalistSchema = z.object({
  competitionId: z.string().uuid(),
  laneId: z.string().uuid(),
  checkpointId: z.string().uuid(),
  rank: z.number().int().min(2).max(99),
  afterShot: z.number().int().positive(),
});

const ExecuteFinalScriptStepSchema = z.object({
  competitionId: z.string().uuid(),
  runId: z.string().uuid(),
  confirmationEntryId: z.string().uuid(),
  branch: z.enum(['MAIN', 'SHOOT_OFF']).default('MAIN'),
  iteration: z.number().int().nonnegative().default(0),
  step: FinalOperationScriptStepDtoSchema,
  eligibleLaneIds: z.array(z.string().uuid()).optional(),
  acknowledgedRequirementIds: AcknowledgedRequirementIdsSchema,
  declarationConfirmation: z
    .object({
      finalProtestsResolved: z.literal(true),
      resultProcessConfirmed: z.literal(true),
    })
    .optional(),
});

const FinalScriptStepExecutionResultSchema = z.object({
  success: z.boolean(),
  cueId: z.string().uuid(),
  cuePublished: z.boolean(),
  command: CommandExecutionResultSchema.nullable(),
  declarationId: z.string().uuid().nullable(),
  statement: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type BrokerConfig = z.infer<typeof BrokerConfigSchema>;
export type SetBrokerConfigPayload = z.infer<typeof SetBrokerConfigPayloadSchema>;
export type BrokerStatus = z.infer<typeof BrokerStatusSchema>;
export type DirectorLaneSnapshotDto = z.infer<typeof DirectorLaneSnapshotSchema>;
export type MqttControlSnapshotDto = z.infer<typeof MqttControlSnapshotSchema>;
export type MqttCommandExecutionResultDto = z.infer<typeof CommandExecutionResultSchema>;
export type MqttCommandBatchResultDto = z.infer<typeof CommandBatchResultSchema>;
export type FiringWindowViolationDto = z.infer<typeof FiringWindowViolationDtoSchema>;
export type ShotObservationEvidenceDto = z.infer<typeof ShotObservationEvidenceDtoSchema>;
export type ClockQualityAssessmentDto = z.infer<typeof ClockQualityAssessmentDtoSchema>;
export type LaneClockProbeResultDto = z.infer<typeof LaneClockProbeResultSchema>;
export type SafetyStopAuditEntryDto = z.infer<typeof SafetyStopAuditEntrySchema>;
export type FinalScriptStepExecutionResultDto = z.infer<typeof FinalScriptStepExecutionResultSchema>;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export const mqttContract = defineContract('mqtt', {
  getBrokerConfig: query(queryResponseSchema(BrokerConfigSchema)),
  setBrokerConfig: command(SetBrokerConfigPayloadSchema, CommandResponseSchema),
  getBrokerStatus: query(queryResponseSchema(BrokerStatusSchema)),
  startBroker: command(CommandResponseSchema),
  stopBroker: command(CommandResponseSchema),
  connect: command(CommandResponseSchema),
  disconnect: command(CommandResponseSchema),
  getControlState: query(queryResponseSchema(MqttControlSnapshotSchema)),
  getFiringWindowViolations: query(CompetitionSchema, queryResponseSchema(z.array(FiringWindowViolationDtoSchema))),
  getShotObservationEvidence: query(CompetitionSchema, queryResponseSchema(z.array(ShotObservationEvidenceDtoSchema))),
  getClockQuality: query(queryResponseSchema(z.record(z.string().uuid(), ClockQualityAssessmentDtoSchema))),
  getSafetyStopAudit: query(
    z.object({ safetyStopId: z.string().uuid().optional() }),
    queryResponseSchema(z.array(SafetyStopAuditEntrySchema)),
  ),
  probeLaneClock: command(LaneSchema, commandDataResponseSchema(LaneClockProbeResultSchema)),
  activateSafetyStop: command(ActivateSafetyStopSchema, commandDataResponseSchema(CommandBatchResultSchema)),
  clearSafetyStop: command(ClearSafetyStopSchema, commandDataResponseSchema(CommandBatchResultSchema)),
  createCompetition: command(CreateCompetitionSchema, commandDataResponseSchema(CompetitionStatePayloadSchema)),
  joinCompetition: command(CompetitionAndLanesSchema, commandDataResponseSchema(CommandBatchResultSchema)),
  leaveCompetition: command(CompetitionAndLanesSchema, commandDataResponseSchema(CommandBatchResultSchema)),
  assignAthlete: command(AssignAthleteSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  resetSession: command(ResetSessionSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  pauseLaneTimer: command(InterruptionLaneSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  resumeLaneTimer: command(ResumeLaneTimerSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  resumeLaneMatch: command(InterruptionLaneSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  pauseRangeTimers: command(InterruptionRangeSchema, commandDataResponseSchema(CommandBatchResultSchema)),
  resumeRangeTimers: command(ResumeRangeTimersSchema, commandDataResponseSchema(CommandBatchResultSchema)),
  resumeRangeMatch: command(InterruptionRangeSchema, commandDataResponseSchema(CommandBatchResultSchema)),
  startSighting: command(StartSightingSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  endSighting: command(CompetitionSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  startMatch: command(StartMatchSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  startTimedTarget: command(StartTimedTargetSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  cancelTimedTarget: command(CancelTimedTargetSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  executeFinalScriptStep: command(
    ExecuteFinalScriptStepSchema,
    commandDataResponseSchema(FinalScriptStepExecutionResultSchema),
  ),
  clearFinalCue: command(CompetitionSchema, CommandResponseSchema),
  restartTimer: command(RestartTimerSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  advanceSeries: command(AdvanceSeriesSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  retireFinalist: command(RetireFinalistSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  finishCompetition: command(FinishCompetitionSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
});
