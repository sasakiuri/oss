// SPDX-License-Identifier: MIT
/**
 * Competition IPC Contract
 *
 * @description
 * Defines Zod-based contracts for competition-related IPC channels.
 * Covers competition lifecycle commands (start, stage, series, advance, finish)
 * and competition data queries (state, types).
 */

import { z } from 'zod';

import { PHASE_VALUES } from '@/shared/types/Phase';

import {
  CommandResponseSchema,
  command,
  commandDataResponseSchema,
  defineContract,
  query,
  queryResponseSchema,
} from '../defineContract';

// ============================================================
// Command input schemas
// ============================================================

const StartCompetitionInputSchema = z.object({
  competitionTypeId: z.string(),
});

const CompetitionIdInputSchema = z.object({
  competitionId: z.string(),
});

// ============================================================
// DTO schemas (query responses)
// ============================================================

const TimerDtoSchema = z.object({
  remainingSeconds: z.number(),
  totalSeconds: z.number(),
  formattedRemaining: z.string(),
  isExpired: z.boolean(),
});

const CompetitionStateDtoSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  phase: z.enum(PHASE_VALUES),
  currentStageIndex: z.number(),
  currentSeriesIndex: z.number(),
  seriesShotCount: z.number(),
  timer: TimerDtoSchema,
  currentStageName: z.string(),
  scored: z.boolean(),
  shotsPerSeries: z.number(),
});

const CompetitionTypeDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
});

// ============================================================
// Custom response for startCompetition (returns competitionId)
// ============================================================

const StartCompetitionResponseSchema = commandDataResponseSchema(
  z.object({ competitionId: z.string(), sessionId: z.string() }),
);

// ============================================================
// Contract definition
// ============================================================

export const competitionContract = defineContract('competition', {
  startCompetition: command(StartCompetitionInputSchema, StartCompetitionResponseSchema, {
    channel: 'command:startCompetition',
  }),
  startStage: command(CompetitionIdInputSchema, commandDataResponseSchema(z.object({ sessionId: z.string() })), {
    channel: 'command:startStage',
  }),
  startNextSeries: command(CompetitionIdInputSchema, CommandResponseSchema, {
    channel: 'command:startNextSeries',
  }),
  advanceStage: command(CompetitionIdInputSchema, CommandResponseSchema, {
    channel: 'command:advanceStage',
  }),
  endStage: command(CompetitionIdInputSchema, CommandResponseSchema, {
    channel: 'command:endStage',
  }),
  finishCompetition: command(CompetitionIdInputSchema, CommandResponseSchema, {
    channel: 'command:finishCompetition',
  }),
  getCompetitionState: query(CompetitionIdInputSchema, queryResponseSchema(CompetitionStateDtoSchema), {
    channel: 'query:getCompetitionState',
  }),
  getCompetitionTypes: query(queryResponseSchema(z.array(CompetitionTypeDtoSchema)), {
    channel: 'query:getCompetitionTypes',
  }),
});

// ============================================================
// Exported inferred types
// ============================================================

export type StartCompetitionInput = z.infer<typeof StartCompetitionInputSchema>;
export type CompetitionIdInput = z.infer<typeof CompetitionIdInputSchema>;
export type CompetitionStateDto = z.infer<typeof CompetitionStateDtoSchema>;
export type CompetitionTypeDto = z.infer<typeof CompetitionTypeDtoSchema>;
export type StartCompetitionResponse = z.infer<typeof StartCompetitionResponseSchema>;
