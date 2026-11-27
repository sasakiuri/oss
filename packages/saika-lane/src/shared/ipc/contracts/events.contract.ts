// SPDX-License-Identifier: MIT
import { defineEvent, defineEventContract } from '@sasakiuri/saika-ipc';
import { CompetitionCuePayloadSchema } from '@sasakiuri/saika-protocol/CompetitionCue';
import { TimedTargetStateSchema } from '@sasakiuri/saika-protocol/TimedTargetState';
import { z } from 'zod';

import { LOG_LEVELS, LOG_SOURCES } from '@/shared/types/log';
import { PHASE_VALUES } from '@/shared/types/Phase';

import {
  DisciplineSchema,
  InterruptionStatusSchema,
  MqttConnectionStatusSchema,
  ScoringAccSchema,
  TargetManufacturerSchema,
} from '../schemas/common';

import { DirectorMembershipDtoSchema, LaneSafetyStateDtoSchema } from './mqtt.contract';
import { SessionModeSchema, ShotDtoSchema } from './session.contract';
import { AppUpdateStateSchema } from './updater.contract';
import { FullscreenStateDtoSchema } from './window.contract';

// ============================================================
// Shared enums / literals
// ============================================================

const ConnectionStatusSchema = z.union([z.literal('connected'), z.literal('disconnected')]);

const ErrorSeveritySchema = z.union([z.literal('error'), z.literal('warning'), z.literal('info')]);

const LogLevelSchema = z.enum(LOG_LEVELS);

const LogSourceSchema = z.enum(LOG_SOURCES);

// ============================================================
// Event payload schemas
// ============================================================

const ShotRecordedEventSchema = z.object({
  sessionId: z.string(),
  shot: ShotDtoSchema,
});

const ShotReceivedSignalSchema = z.object({});

const ConnectionStatusChangedEventSchema = z.object({
  connectionId: z.string(),
  status: ConnectionStatusSchema,
  manufacturer: TargetManufacturerSchema.optional(),
  portPath: z.string().optional(),
  reason: z.string().optional(),
  deviceId: z.string().nullable().optional(),
});

const SessionStartedEventSchema = z.object({
  sessionId: z.string(),
  discipline: DisciplineSchema,
});

const ModeSwitchedEventSchema = z.object({
  sessionId: z.string(),
  mode: SessionModeSchema,
});

const SessionResetEventSchema = z.object({
  sessionId: z.string(),
});

const IpcErrorEventSchema = z.object({
  code: z.string(),
  message: z.string(),
  userMessage: z.string(),
  severity: ErrorSeveritySchema,
});

const LogEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  level: LogLevelSchema,
  message: z.string(),
  source: LogSourceSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const LogMessageEventSchema = z.object({
  entry: LogEntrySchema,
});

// ============================================================
// Competition event payload schemas
// ============================================================

const CompetitionStartedEventSchema = z.object({
  competitionId: z.string(),
  competitionTypeId: z.string(),
  sessionId: z.string(),
  config: z.unknown(),
  shotsPerSeries: z.number(),
  acc: ScoringAccSchema,
});

const PhaseChangedEventSchema = z.object({
  previousPhase: z.enum(PHASE_VALUES),
  newPhase: z.enum(PHASE_VALUES),
  stageIndex: z.number(),
  seriesIndex: z.number(),
  stageName: z.string(),
  scored: z.boolean(),
  targetProfileId: z.string().min(1).optional(),
  scoringGaugeProfileId: z.string().min(1).optional(),
});

const CompetitionProgressChangedEventSchema = z.object({
  competitionId: z.string(),
  stageIndex: z.number(),
  seriesIndex: z.number(),
  shotCount: z.number(),
});

const TimerTickEventSchema = z.object({
  remainingSeconds: z.number(),
  totalSeconds: z.number(),
  formattedRemaining: z.string(),
});

const TimerExpiredEventSchema = z.object({
  stageIndex: z.number(),
});

const CompetitionInterruptionChangedEventSchema = z.object({
  competitionId: z.string(),
  interruptionId: z.string().uuid(),
  status: InterruptionStatusSchema,
  remainingSeconds: z.number().int().nonnegative(),
  unlimitedSightingShots: z.boolean(),
  remainingTimeVerified: z.boolean().optional(),
});

const SafetyStopChangedEventSchema = LaneSafetyStateDtoSchema;

const CompetitionCueChangedEventSchema = z.object({
  competitionId: z.string().uuid(),
  cue: CompetitionCuePayloadSchema.nullable(),
});

const TimedTargetSequenceChangedEventSchema = TimedTargetStateSchema;

const SeriesCompletedEventSchema = z.object({
  stageIndex: z.number(),
  seriesIndex: z.number(),
  shotCount: z.number(),
});

const CompetitionFinishedEventSchema = z.object({
  sessionId: z.string(),
});

const MqttStatusChangedEventSchema = z.object({
  error: z.string().optional(),
  status: MqttConnectionStatusSchema,
  brokerUrl: z.string().optional(),
  laneId: z.string().optional(),
});

const FullscreenChangedEventSchema = FullscreenStateDtoSchema;

const UpdateStateChangedEventSchema = AppUpdateStateSchema;

// ============================================================
// Event contract definition
// ============================================================

export const eventsContract = defineEventContract('events', {
  shotReceived: defineEvent(ShotReceivedSignalSchema, {
    channel: 'event:shotReceived',
  }),
  shotRecorded: defineEvent(ShotRecordedEventSchema, {
    channel: 'event:shotRecorded',
  }),
  positionExtraNullified: defineEvent(
    z.object({ sessionId: z.string(), competitionId: z.string(), resetError: z.string().optional() }),
    {
      channel: 'event:positionExtraNullified',
    },
  ),
  connectionStatusChanged: defineEvent(ConnectionStatusChangedEventSchema, {
    channel: 'event:connectionStatusChanged',
  }),
  sessionStarted: defineEvent(SessionStartedEventSchema, {
    channel: 'event:sessionStarted',
  }),
  modeSwitched: defineEvent(ModeSwitchedEventSchema, {
    channel: 'event:modeSwitched',
  }),
  sessionReset: defineEvent(SessionResetEventSchema, {
    channel: 'event:sessionReset',
  }),
  error: defineEvent(IpcErrorEventSchema, {
    channel: 'error',
  }),
  logMessage: defineEvent(LogMessageEventSchema, {
    channel: 'log:message',
  }),
  competitionStarted: defineEvent(CompetitionStartedEventSchema, {
    channel: 'event:competitionStarted',
  }),
  phaseChanged: defineEvent(PhaseChangedEventSchema, {
    channel: 'event:phaseChanged',
  }),
  competitionProgressChanged: defineEvent(CompetitionProgressChangedEventSchema, {
    channel: 'event:competitionProgressChanged',
  }),
  timerTick: defineEvent(TimerTickEventSchema, {
    channel: 'event:timerTick',
  }),
  timerExpired: defineEvent(TimerExpiredEventSchema, {
    channel: 'event:timerExpired',
  }),
  competitionInterruptionChanged: defineEvent(CompetitionInterruptionChangedEventSchema, {
    channel: 'event:competitionInterruptionChanged',
  }),
  safetyStopChanged: defineEvent(SafetyStopChangedEventSchema, {
    channel: 'event:safetyStopChanged',
  }),
  competitionCueChanged: defineEvent(CompetitionCueChangedEventSchema, {
    channel: 'event:competitionCueChanged',
  }),
  timedTargetSequenceChanged: defineEvent(TimedTargetSequenceChangedEventSchema, {
    channel: 'event:timedTargetSequenceChanged',
  }),
  seriesCompleted: defineEvent(SeriesCompletedEventSchema, {
    channel: 'event:seriesCompleted',
  }),
  competitionFinished: defineEvent(CompetitionFinishedEventSchema, {
    channel: 'event:competitionFinished',
  }),
  directorMembershipChanged: defineEvent(DirectorMembershipDtoSchema, {
    channel: 'event:directorMembershipChanged',
  }),
  mqttStatusChanged: defineEvent(MqttStatusChangedEventSchema, {
    channel: 'event:mqttStatusChanged',
  }),
  fullscreenChanged: defineEvent(FullscreenChangedEventSchema, {
    channel: 'event:fullscreenChanged',
  }),
  updateStateChanged: defineEvent(UpdateStateChangedEventSchema, {
    channel: 'event:updateStateChanged',
  }),
});

// ============================================================
// Exported inferred types
// ============================================================

export type ShotReceivedSignalPayload = z.infer<typeof ShotReceivedSignalSchema>;
export type ShotRecordedEventPayload = z.infer<typeof ShotRecordedEventSchema>;
export type ConnectionStatusChangedEventPayload = z.infer<typeof ConnectionStatusChangedEventSchema>;
export type SessionStartedEventPayload = z.infer<typeof SessionStartedEventSchema>;
export type ModeSwitchedEventPayload = z.infer<typeof ModeSwitchedEventSchema>;
export type SessionResetEventPayload = z.infer<typeof SessionResetEventSchema>;
export type IpcErrorEventPayload = z.infer<typeof IpcErrorEventSchema>;
export type LogMessageEventPayload = z.infer<typeof LogMessageEventSchema>;
export type LogEntryDto = z.infer<typeof LogEntrySchema>;
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;
export type CompetitionStartedEventPayload = z.infer<typeof CompetitionStartedEventSchema>;
export type PhaseChangedEventPayload = z.infer<typeof PhaseChangedEventSchema>;
export type CompetitionProgressChangedEventPayload = z.infer<typeof CompetitionProgressChangedEventSchema>;
export type TimerTickEventPayload = z.infer<typeof TimerTickEventSchema>;
export type TimerExpiredEventPayload = z.infer<typeof TimerExpiredEventSchema>;
export type SafetyStopChangedEventPayload = z.infer<typeof SafetyStopChangedEventSchema>;
export type CompetitionCueChangedEventPayload = z.infer<typeof CompetitionCueChangedEventSchema>;
export type TimedTargetSequenceChangedEventPayload = z.infer<typeof TimedTargetSequenceChangedEventSchema>;
export type SeriesCompletedEventPayload = z.infer<typeof SeriesCompletedEventSchema>;
export type CompetitionFinishedEventPayload = z.infer<typeof CompetitionFinishedEventSchema>;
export type MqttStatusChangedEventPayload = z.infer<typeof MqttStatusChangedEventSchema>;
export type FullscreenChangedEventPayload = z.infer<typeof FullscreenChangedEventSchema>;
export type UpdateStateChangedEventPayload = z.infer<typeof UpdateStateChangedEventSchema>;

export type DirectorMembershipChangedEventPayload = z.infer<typeof DirectorMembershipDtoSchema>;
