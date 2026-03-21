// SPDX-License-Identifier: MIT
/**
 * Report IPC Contract
 *
 * @description
 * Defines Zod-based contracts for report/print-related IPC channels.
 * Covers score sheet queries and print window commands.
 */

import { z } from 'zod';

import { command, CommandResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';
import { DisciplineSchema } from '../schemas/common';

// ============================================================
// Command input schemas
// ============================================================

const OpenPrintWindowInputSchema = z.object({
  sessionId: z.string(),
});

// ============================================================
// Query input schemas
// ============================================================

const GetScoreSheetInputSchema = z.object({
  sessionId: z.string(),
});

// ============================================================
// DTO schemas (query responses)
// ============================================================

const ScoreSheetShotDtoSchema = z.object({
  shotNumber: z.number(),
  value: z.number(),
  integerValue: z.number(),
  seriesNumber: z.number(),
  x: z.number().nullable(),
  y: z.number().nullable(),
});

const ScoreSheetDtoSchema = z.object({
  sessionId: z.string(),
  laneNumber: z.number(),
  relay: z.number(),
  playerName: z.string(),
  affiliation: z.string(),
  allShots: z.array(ScoreSheetShotDtoSchema),
  seriesScores: z.array(z.number().int()),
  totalScore: z.number().int(),
  totalIntegerScore: z.number(),
  disciplineName: z.string().optional(),
  discipline: DisciplineSchema,
});

// ============================================================
// Contract definition
// ============================================================

export const reportContract = defineContract('report', {
  getScoreSheet: query(GetScoreSheetInputSchema, queryResponseSchema(ScoreSheetDtoSchema), {
    channel: 'query:getScoreSheet',
  }),
  openPrintWindow: command(OpenPrintWindowInputSchema, CommandResponseSchema, {
    channel: 'command:openPrintWindow',
  }),
});

// ============================================================
// Exported inferred types
// ============================================================

export type OpenPrintWindowInput = z.infer<typeof OpenPrintWindowInputSchema>;
export type GetScoreSheetInput = z.infer<typeof GetScoreSheetInputSchema>;
export type ScoreSheetShotDto = z.infer<typeof ScoreSheetShotDtoSchema>;
export type ScoreSheetDto = z.infer<typeof ScoreSheetDtoSchema>;
