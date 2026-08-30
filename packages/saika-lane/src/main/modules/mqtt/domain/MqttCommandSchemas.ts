// SPDX-License-Identifier: MIT
/**
 * MQTT Command Schemas
 *
 * @description
 * Zod-based schemas for all MQTT command payloads.
 * Covers Tier 1 lane commands, broadcast commands, per-lane commands, and ACK.
 */

import { z } from 'zod';

import { AthleteSchema } from './MqttAssignmentSchemas';

// ============================================================
// Common base schema
// ============================================================

const CommandBaseSchema = z.object({
  commandId: z.string().uuid(),
  issuedBy: z.string(),
  issuedAt: z.string().datetime(),
});

// ============================================================
// Tier 1 Lane Commands
// ============================================================

export const JoinCompetitionCmdSchema = CommandBaseSchema.extend({
  competitionId: z.string().uuid(),
});

export const LeaveCompetitionCmdSchema = CommandBaseSchema.extend({
  competitionId: z.string().uuid(),
});

export const ProbeClockCmdSchema = CommandBaseSchema.extend({
  directorSentAt: z.string().datetime(),
});

export const ActivateSafetyStopCmdSchema = CommandBaseSchema.extend({
  safetyStopId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

export const ClearSafetyStopCmdSchema = CommandBaseSchema.extend({
  safetyStopId: z.string().uuid(),
  clearanceReason: z.string().trim().min(1).max(500),
  confirmedSafe: z.literal(true),
});

// ============================================================
// Broadcast Commands
// ============================================================

export const StartSightingCmdSchema = CommandBaseSchema.extend({
  timerStartAt: z.string().datetime(),
  timerDurationSeconds: z.number().int().positive(),
  targetLaneIds: z.array(z.string().uuid()).optional(),
});

export const EndSightingCmdSchema = CommandBaseSchema;

export const StartMatchCmdSchema = CommandBaseSchema.extend({
  timerStartAt: z.string().datetime(),
  timerDurationSeconds: z.number().int().positive(),
});

export const TimerStartedCmdSchema = CommandBaseSchema.extend({
  timerScope: z.enum(['STAGE', 'SERIES']),
  timerStartAt: z.string().datetime(),
  timerDurationSeconds: z.number().int().positive(),
  stageIndex: z.number().int().min(0),
  seriesIndex: z.number().int().min(0).nullable(),
});

export const TimerExpiredCmdSchema = CommandBaseSchema.extend({
  timerScope: z.enum(['STAGE', 'SERIES']),
  stageIndex: z.number().int().min(0),
  seriesIndex: z.number().int().min(0).nullable(),
  expiredAt: z.string().datetime(),
});

export const AdvanceSeriesCmdSchema = CommandBaseSchema.extend({
  stageIndex: z.number().int().min(0),
  fromSeriesIndex: z.number().int().min(0),
  resumeOnly: z.boolean().optional(),
  timerStartAt: z.string().datetime().optional(),
  timerDurationSeconds: z.number().int().positive().optional(),
});

export const FinishCompetitionCmdSchema = CommandBaseSchema;

// ============================================================
// Per-Lane Commands
// ============================================================

export const AssignAthleteCmdSchema = CommandBaseSchema.extend({
  athlete: AthleteSchema.nullable(),
});

export const ResetSessionCmdSchema = CommandBaseSchema.extend({
  reason: z.string().optional(),
});

export const PauseTimerCmdSchema = CommandBaseSchema.extend({
  interruptionId: z.string().uuid(),
  pausedAt: z.string().datetime(),
});

export const ResumeTimerCmdSchema = CommandBaseSchema.extend({
  interruptionId: z.string().uuid(),
  timerStartAt: z.string().datetime(),
  authorizedRemainingSeconds: z.number().int().positive(),
  unlimitedSightingShots: z.boolean(),
});

export const ResumeMatchCmdSchema = CommandBaseSchema.extend({
  interruptionId: z.string().uuid(),
});

export const RetireFinalistCmdSchema = CommandBaseSchema.extend({
  checkpointId: z.string().uuid(),
  rank: z.number().int().min(2).max(99),
  afterShot: z.number().int().positive(),
});

export const StartShootOffCmdSchema = CommandBaseSchema.extend({
  runId: z.string().uuid(),
  iteration: z.number().int().positive(),
  timerStartAt: z.string().datetime(),
  timerDurationSeconds: z.number().int().positive(),
  targetLaneIds: z.array(z.string().uuid()).min(2),
});

export const StopShootOffCmdSchema = CommandBaseSchema.extend({
  runId: z.string().uuid(),
  iteration: z.number().int().positive(),
  targetLaneIds: z.array(z.string().uuid()).min(2),
});

// ============================================================
// ACK
// ============================================================

export const CommandAckPayloadSchema = z.object({
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

// ============================================================
// Exported inferred types
// ============================================================

export type CommandBase = z.infer<typeof CommandBaseSchema>;
export type JoinCompetitionCmd = z.infer<typeof JoinCompetitionCmdSchema>;
export type LeaveCompetitionCmd = z.infer<typeof LeaveCompetitionCmdSchema>;
export type ProbeClockCmd = z.infer<typeof ProbeClockCmdSchema>;
export type ActivateSafetyStopCmd = z.infer<typeof ActivateSafetyStopCmdSchema>;
export type ClearSafetyStopCmd = z.infer<typeof ClearSafetyStopCmdSchema>;
export type StartSightingCmd = z.infer<typeof StartSightingCmdSchema>;
export type EndSightingCmd = z.infer<typeof EndSightingCmdSchema>;
export type StartMatchCmd = z.infer<typeof StartMatchCmdSchema>;
export type TimerStartedCmd = z.infer<typeof TimerStartedCmdSchema>;
export type TimerExpiredCmd = z.infer<typeof TimerExpiredCmdSchema>;
export type AdvanceSeriesCmd = z.infer<typeof AdvanceSeriesCmdSchema>;
export type FinishCompetitionCmd = z.infer<typeof FinishCompetitionCmdSchema>;
export type AssignAthleteCmd = z.infer<typeof AssignAthleteCmdSchema>;
export type ResetSessionCmd = z.infer<typeof ResetSessionCmdSchema>;
export type PauseTimerCmd = z.infer<typeof PauseTimerCmdSchema>;
export type ResumeTimerCmd = z.infer<typeof ResumeTimerCmdSchema>;
export type ResumeMatchCmd = z.infer<typeof ResumeMatchCmdSchema>;
export type RetireFinalistCmd = z.infer<typeof RetireFinalistCmdSchema>;
export type StartShootOffCmd = z.infer<typeof StartShootOffCmdSchema>;
export type StopShootOffCmd = z.infer<typeof StopShootOffCmdSchema>;
export type CommandAckPayload = z.infer<typeof CommandAckPayloadSchema>;
