// SPDX-License-Identifier: MIT
/**
 * Events IPC Contract
 *
 * @description
 * Defines Zod-based event contracts for Main-to-Renderer push notifications.
 * Covers shot recording, connection status, session lifecycle, errors, and log messages.
 */

import { z } from 'zod';

import { PHASE_VALUES } from '@/shared/types/Phase';

import { defineEvent, defineEventContract } from '../defineContract';
import { DisciplineSchema, TargetManufacturerSchema } from '../schemas/common';

// ============================================================
// Shared enums / literals
// ============================================================

const ConnectionStatusSchema = z.union([z.literal('connected'), z.literal('disconnected')]);

const SessionModeSchema = z.union([z.literal('SIGHTING'), z.literal('MATCH')]);

const ErrorSeveritySchema = z.union([z.literal('error'), z.literal('warning'), z.literal('info')]);

const LogLevelSchema = z.union([z.literal('debug'), z.literal('info'), z.literal('warn'), z.literal('error')]);

const LogSourceSchema = z.union([
  z.literal('main'),
  z.literal('ipc'),
  z.literal('usb'),
  z.literal('domain'),
  z.literal('cqrs'),
  z.literal('module'),
  z.literal('renderer'),
]);

// ============================================================
// Event payload schemas
// ============================================================

/**
 * ShotDto schema matching the application DTO
 */
const ShotDtoSchema = z.object({
  id: z.string(),
  shotNumber: z.number(),
  x: z.number().nullable(),
  y: z.number().nullable(),
  score: z.number().int(),
  innerTen: z.boolean(),
  timestamp: z.string(),
  mode: z.string(),
  isRecorded: z.boolean(),
});

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
  acc: z.union([z.literal('RING'), z.literal('DECIMAL')]),
});

const PhaseChangedEventSchema = z.object({
  previousPhase: z.enum(PHASE_VALUES),
  newPhase: z.enum(PHASE_VALUES),
  stageIndex: z.number(),
  seriesIndex: z.number(),
  stageName: z.string(),
  scored: z.boolean(),
});

const TimerTickEventSchema = z.object({
  remainingSeconds: z.number(),
  totalSeconds: z.number(),
  formattedRemaining: z.string(),
});

const TimerExpiredEventSchema = z.object({
  stageIndex: z.number(),
});

const SeriesCompletedEventSchema = z.object({
  stageIndex: z.number(),
  seriesIndex: z.number(),
  shotCount: z.number(),
});

const StageAdvancedEventSchema = z.object({
  previousStageIndex: z.number(),
  newStageIndex: z.number(),
  stageName: z.string(),
  scored: z.boolean(),
});

const CompetitionFinishedEventSchema = z.object({
  sessionId: z.string(),
});

const MqttStatusChangedEventSchema = z.object({
  status: z.union([z.literal('connected'), z.literal('disconnected'), z.literal('connecting')]),
  brokerUrl: z.string().optional(),
  laneId: z.string().optional(),
});

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
  timerTick: defineEvent(TimerTickEventSchema, {
    channel: 'event:timerTick',
  }),
  timerExpired: defineEvent(TimerExpiredEventSchema, {
    channel: 'event:timerExpired',
  }),
  seriesCompleted: defineEvent(SeriesCompletedEventSchema, {
    channel: 'event:seriesCompleted',
  }),
  stageAdvanced: defineEvent(StageAdvancedEventSchema, {
    channel: 'event:stageAdvanced',
  }),
  competitionFinished: defineEvent(CompetitionFinishedEventSchema, {
    channel: 'event:competitionFinished',
  }),
  mqttStatusChanged: defineEvent(MqttStatusChangedEventSchema, {
    channel: 'event:mqttStatusChanged',
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
export type TimerTickEventPayload = z.infer<typeof TimerTickEventSchema>;
export type TimerExpiredEventPayload = z.infer<typeof TimerExpiredEventSchema>;
export type SeriesCompletedEventPayload = z.infer<typeof SeriesCompletedEventSchema>;
export type StageAdvancedEventPayload = z.infer<typeof StageAdvancedEventSchema>;
export type CompetitionFinishedEventPayload = z.infer<typeof CompetitionFinishedEventSchema>;
export type MqttStatusChangedEventPayload = z.infer<typeof MqttStatusChangedEventSchema>;
