// SPDX-License-Identifier: MIT
/**
 * MQTT Command Schemas
 *
 * @description
 * Zod-based schemas for all MQTT command payloads.
 * Covers Tier 1 lane commands, broadcast commands, per-lane commands, and ACK.
 */

import { z } from 'zod';

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
  timerStartAt: z.string().datetime().optional(),
});

export const FinishCompetitionCmdSchema = CommandBaseSchema;

// ============================================================
// Per-Lane Commands
// ============================================================

export const AssignAthleteCmdSchema = CommandBaseSchema.extend({
  athlete: z
    .object({
      startNumber: z.number().int().positive(),
      id: z.string(),
      name: z.string(),
      teamName: z.string().optional(),
      issfCode: z.string().optional(),
    })
    .nullable(),
});

export const ResetSessionCmdSchema = CommandBaseSchema.extend({
  reason: z.string().optional(),
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
  acknowledgedAt: z.string().datetime(),
});

// ============================================================
// Exported inferred types
// ============================================================

export type CommandBase = z.infer<typeof CommandBaseSchema>;
export type JoinCompetitionCmd = z.infer<typeof JoinCompetitionCmdSchema>;
export type LeaveCompetitionCmd = z.infer<typeof LeaveCompetitionCmdSchema>;
export type StartSightingCmd = z.infer<typeof StartSightingCmdSchema>;
export type EndSightingCmd = z.infer<typeof EndSightingCmdSchema>;
export type StartMatchCmd = z.infer<typeof StartMatchCmdSchema>;
export type TimerStartedCmd = z.infer<typeof TimerStartedCmdSchema>;
export type TimerExpiredCmd = z.infer<typeof TimerExpiredCmdSchema>;
export type AdvanceSeriesCmd = z.infer<typeof AdvanceSeriesCmdSchema>;
export type FinishCompetitionCmd = z.infer<typeof FinishCompetitionCmdSchema>;
export type AssignAthleteCmd = z.infer<typeof AssignAthleteCmdSchema>;
export type ResetSessionCmd = z.infer<typeof ResetSessionCmdSchema>;
export type CommandAckPayload = z.infer<typeof CommandAckPayloadSchema>;
