// SPDX-License-Identifier: MIT
/**
 * Session IPC Contract
 *
 * @description
 * Defines Zod-based contracts for session-related IPC channels.
 * Covers session lifecycle commands (start, record shot, switch mode, reset)
 * and session data queries (score, shot history).
 */

import { z } from 'zod';

import {
  CommandResponseSchema,
  command,
  commandDataResponseSchema,
  defineContract,
  query,
  queryResponseSchema,
} from '../defineContract';
import { DisciplineSchema } from '../schemas/common';

// ============================================================
// Shared enums / literals
// ============================================================

const SessionModeSchema = z.union([z.literal('SIGHTING'), z.literal('MATCH')]);

// ============================================================
// Command input schemas
// ============================================================

const StartSessionInputSchema = z.object({
  discipline: DisciplineSchema,
});

const RecordShotInputSchema = z.object({
  sessionId: z.string(),
  impactPoint: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .nullable(),
  timestamp: z.string(),
});

const SwitchModeInputSchema = z.object({
  sessionId: z.string(),
  mode: SessionModeSchema,
});

const ResetSessionInputSchema = z.object({
  sessionId: z.string(),
});

// ============================================================
// Query input schemas
// ============================================================

const GetSessionScoreInputSchema = z.object({
  sessionId: z.string(),
});

const GetShotHistoryInputSchema = z.object({
  sessionId: z.string(),
});

// ============================================================
// DTO schemas (query responses)
// ============================================================

const SessionScoreDtoSchema = z.object({
  sessionId: z.string(),
  totalScore: z.number().int(),
  seriesScores: z.array(z.number().int()),
  shotCount: z.number(),
  discipline: z.string(),
  mode: z.string(),
});

const ShotDtoSchema = z.object({
  id: z.string(),
  shotNumber: z.number(),
  seriesNumber: z.number().optional(),
  x: z.number().nullable(),
  y: z.number().nullable(),
  score: z.number().int(),
  innerTen: z.boolean(),
  timestamp: z.string(),
  mode: z.string(),
  isRecorded: z.boolean(),
});

const ShotHistoryDtoSchema = z.object({
  sessionId: z.string(),
  shots: z.array(ShotDtoSchema),
});

// ============================================================
// Custom response for startSession (returns sessionId)
// ============================================================

const StartSessionResponseSchema = commandDataResponseSchema(z.object({ sessionId: z.string() }));

// ============================================================
// Contract definition
// ============================================================

export const sessionContract = defineContract('session', {
  startSession: command(StartSessionInputSchema, StartSessionResponseSchema, {
    channel: 'command:startSession',
  }),
  recordShot: command(RecordShotInputSchema, CommandResponseSchema, {
    channel: 'command:recordShot',
  }),
  switchMode: command(SwitchModeInputSchema, CommandResponseSchema, {
    channel: 'command:switchMode',
  }),
  resetSession: command(ResetSessionInputSchema, CommandResponseSchema, {
    channel: 'command:resetSession',
  }),
  getSessionScore: query(GetSessionScoreInputSchema, queryResponseSchema(SessionScoreDtoSchema), {
    channel: 'query:getSessionScore',
  }),
  getShotHistory: query(GetShotHistoryInputSchema, queryResponseSchema(ShotHistoryDtoSchema), {
    channel: 'query:getShotHistory',
  }),
});

// ============================================================
// Exported inferred types
// ============================================================

export type StartSessionInput = z.infer<typeof StartSessionInputSchema>;
export type RecordShotInput = z.infer<typeof RecordShotInputSchema>;
export type SwitchModeInput = z.infer<typeof SwitchModeInputSchema>;
export type ResetSessionInput = z.infer<typeof ResetSessionInputSchema>;
export type GetSessionScoreInput = z.infer<typeof GetSessionScoreInputSchema>;
export type GetShotHistoryInput = z.infer<typeof GetShotHistoryInputSchema>;
export type SessionScoreDto = z.infer<typeof SessionScoreDtoSchema>;
export type ShotDto = z.infer<typeof ShotDtoSchema>;
export type ShotHistoryDto = z.infer<typeof ShotHistoryDtoSchema>;
export type StartSessionResponse = z.infer<typeof StartSessionResponseSchema>;
export type Discipline = z.infer<typeof DisciplineSchema>;
export type SessionMode = z.infer<typeof SessionModeSchema>;
