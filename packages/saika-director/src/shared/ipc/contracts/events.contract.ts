import { z } from 'zod';
import { MqttControlSnapshotSchema } from './mqtt.contract';
import { defineEventContract, defineEvent } from '../defineContract';

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

const phaseSchema = z.enum([
  'IDLE',
  'ACTIVE',
  'SHOT_COMPLETE',
  'SERIES_COMPLETE',
  'STAGE_ENTERED',
  'SHOOTOFF',
  'FINISHED',
]);
const roundTypeSchema = z.enum(['Elimination', 'Qualification', 'Final', 'Individual']);

// ---------------------------------------------------------------------------
// Event schemas (named for type inference)
// ---------------------------------------------------------------------------

const shotReceivedSchema = z.object({
  channel: z.number(),
  shotNumber: z.number(),
  score: z.number(),
  seriesNumber: z.number(),
});

const phaseChangedSchema = z.object({
  phase: phaseSchema,
  remainingTime: z.number(),
});

const laneConnectedSchema = z.object({ channel: z.number() });

const timerTickSchema = z.object({
  remainingTime: z.number(),
  phase: phaseSchema,
});

const timerExpiredSchema = z.object({ phase: phaseSchema });

const debugLogSchema = z.object({
  timestamp: z.number(),
  direction: z.enum(['TX', 'RX', 'LOG']),
  raw: z.string(),
  parsed: z.string().optional(),
});

const laneTimerTickSchema = z.object({
  laneId: z.string(),
  remainingTime: z.number(),
  phase: phaseSchema,
});

const laneTimerExpiredSchema = z.object({
  laneId: z.string(),
  phase: phaseSchema,
});

const laneControlUpdatedSchema = z.object({
  laneId: z.string(),
  channel: z.number(),
  playerName: z.string().nullable(),
  affiliation: z.string().nullable(),
  participantId: z.string().nullable().optional(),
  relayNumber: z.number().int().positive().optional(),
  phase: phaseSchema,
  remainingTime: z.number(),
  shotNumber: z.number(),
  lastScore: z.number().nullable(),
  lastShotTime: z.number().nullable(),
  seriesScores: z.array(z.number()),
  totalScore: z.number(),
  recentShots: z.array(z.number()),
  matchShots: z.array(z.number()),
  stageIndex: z.number(),
  seriesIndex: z.number(),
  roundType: roundTypeSchema,
  unifiedPhase: z.string(),
  stageName: z.string(),
  stage1Total: z.number(),
  stage2Total: z.number(),
  eliminated: z.boolean(),
  eliminationRank: z.number().nullable(),
});

const mqttConnectionErrorSchema = z.object({ message: z.string() });
const mqttControlStateChangedSchema = MqttControlSnapshotSchema;

const laneControlPatchedSchema = z.object({
  laneId: z.string(),
  seq: z.number(),
  patch: z
    .object({
      channel: z.number(),
      playerName: z.string().nullable(),
      affiliation: z.string().nullable(),
      participantId: z.string().nullable(),
      relayNumber: z.number().int().positive(),
      phase: phaseSchema,
      remainingTime: z.number(),
      shotNumber: z.number(),
      lastScore: z.number().nullable(),
      lastShotTime: z.number().nullable(),
      seriesScores: z.array(z.number()),
      totalScore: z.number(),
      recentShots: z.array(z.number()),
      matchShots: z.array(z.number()),
      stageIndex: z.number(),
      seriesIndex: z.number(),
      roundType: roundTypeSchema,
      unifiedPhase: z.string(),
      stageName: z.string(),
      stage1Total: z.number(),
      stage2Total: z.number(),
      eliminated: z.boolean(),
      eliminationRank: z.number().nullable(),
    })
    .partial(),
});

// ---------------------------------------------------------------------------
// Inferred types (replacing legacy IpcEvents interfaces)
// ---------------------------------------------------------------------------

export type ShotReceivedEvent = z.infer<typeof shotReceivedSchema>;
export type PhaseChangedEvent = z.infer<typeof phaseChangedSchema>;
export type LaneConnectedEvent = z.infer<typeof laneConnectedSchema>;
export type TimerTickEvent = z.infer<typeof timerTickSchema>;
export type TimerExpiredEvent = z.infer<typeof timerExpiredSchema>;
export type DebugLogEvent = z.infer<typeof debugLogSchema>;
export type LaneTimerTickEvent = z.infer<typeof laneTimerTickSchema>;
export type LaneTimerExpiredEvent = z.infer<typeof laneTimerExpiredSchema>;
export type LaneControlUpdatedEvent = z.infer<typeof laneControlUpdatedSchema>;
export type MqttConnectionErrorEvent = z.infer<typeof mqttConnectionErrorSchema>;
export type MqttControlStateChangedEvent = z.infer<typeof mqttControlStateChangedSchema>;
export type LaneControlPatchedEvent = z.infer<typeof laneControlPatchedSchema>;

/**
 * IpcEvents map (replacing legacy IpcEvents interface)
 */
export interface IpcEvents {
  shotReceived: ShotReceivedEvent;
  phaseChanged: PhaseChangedEvent;
  laneConnected: LaneConnectedEvent;
  timerTick: TimerTickEvent;
  timerExpired: TimerExpiredEvent;
  debugLog: DebugLogEvent;
  mqttConnectionError: MqttConnectionErrorEvent;
  mqttControlStateChanged: MqttControlStateChangedEvent;
  laneTimerTick: LaneTimerTickEvent;
  laneTimerExpired: LaneTimerExpiredEvent;
  laneControlUpdated: LaneControlUpdatedEvent;
  laneControlPatched: LaneControlPatchedEvent;
}

// ---------------------------------------------------------------------------
// Event Contract
// ---------------------------------------------------------------------------

export const eventsContract = defineEventContract('event', {
  shotReceived: defineEvent(shotReceivedSchema),
  phaseChanged: defineEvent(phaseChangedSchema),
  laneConnected: defineEvent(laneConnectedSchema),
  timerTick: defineEvent(timerTickSchema),
  timerExpired: defineEvent(timerExpiredSchema),
  debugLog: defineEvent(debugLogSchema),
  mqttConnectionError: defineEvent(mqttConnectionErrorSchema),
  mqttControlStateChanged: defineEvent(mqttControlStateChangedSchema),
  laneTimerTick: defineEvent(laneTimerTickSchema),
  laneTimerExpired: defineEvent(laneTimerExpiredSchema),
  laneControlUpdated: defineEvent(laneControlUpdatedSchema),
  laneControlPatched: defineEvent(laneControlPatchedSchema),
});
