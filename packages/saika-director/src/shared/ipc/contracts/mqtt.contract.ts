import { z } from 'zod';
import {
  AthleteSchema,
  CompetitionShotPayloadSchema,
  CompetitionStatePayloadSchema,
  HardwareStatePayloadSchema,
  LaneAssignmentPayloadSchema,
  LaneCompetitionStatePayloadSchema,
  LaneScorePayloadSchema,
  RawShotPayloadSchema,
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
  acknowledgedAt: z.string().datetime().optional(),
});

const CommandExecutionResultSchema = z.object({
  commandId: z.string().uuid(),
  action: z.enum([
    'join-competition',
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

const DirectorLaneSnapshotSchema = z.object({
  laneId: z.string().uuid(),
  laneAlias: z.string(),
  firingPointNumber: z.number().int().min(1).max(99).nullable(),
  hardware: HardwareStatePayloadSchema.nullable(),
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

const CompetitionAndLanesSchema = z.object({
  competitionId: z.string().uuid(),
  laneIds: z.array(z.string().uuid()).min(1),
});

const CompetitionSchema = z.object({ competitionId: z.string().uuid() });

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

const StartTimerPhaseSchema = z.object({
  competitionId: z.string().uuid(),
  durationSeconds: z.number().int().positive(),
});

const StartSightingSchema = StartTimerPhaseSchema.extend({
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
  createCompetition: command(CreateCompetitionSchema, commandDataResponseSchema(CompetitionStatePayloadSchema)),
  joinCompetition: command(CompetitionAndLanesSchema, commandDataResponseSchema(CommandBatchResultSchema)),
  leaveCompetition: command(CompetitionAndLanesSchema, commandDataResponseSchema(CommandBatchResultSchema)),
  assignAthlete: command(AssignAthleteSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  resetSession: command(ResetSessionSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  startSighting: command(StartSightingSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  endSighting: command(CompetitionSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  startMatch: command(StartTimerPhaseSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  restartTimer: command(RestartTimerSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  advanceSeries: command(AdvanceSeriesSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
  finishCompetition: command(FinishCompetitionSchema, commandDataResponseSchema(CommandExecutionResultSchema)),
});
