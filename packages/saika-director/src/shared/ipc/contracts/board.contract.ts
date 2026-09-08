import { z } from 'zod';

import {
  CommandResponseSchema,
  commandDataResponseSchema,
  defineContract,
  command,
  query,
  queryResponseSchema,
} from '../defineContract';

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// Input schemas (named for type export)
// ---------------------------------------------------------------------------

const OpenTargetBoardPayloadSchema = z.object({
  laneRange: z.object({
    from: z.number().int().min(1),
    to: z.number().int().min(1),
  }),
});

const OpenResultsBoardPayloadSchema = z.object({
  competitionId: uuidSchema,
  eventId: uuidSchema,
});

const OpenFinalBoardPayloadSchema = z.object({
  eventId: uuidSchema,
});

const OpenScoreSheetPrintPayloadSchema = z.object({
  laneIds: z.array(uuidSchema).min(1),
  championshipName: z.string().optional(),
  venue: z.string().optional(),
  eventName: z.string().optional(),
  eventType: z.string().optional(),
});

const OpenResultsListPrintPayloadSchema = z.object({
  eventId: uuidSchema,
  eventName: z.string().optional(),
  relayNumber: z.number().int().positive().optional(),
});

const OpenIncidentReportPrintPayloadSchema = z.object({
  reportId: uuidSchema,
});

const OpenProtestPrintPayloadSchema = z.object({
  protestId: uuidSchema,
});

const BoardWindowConfigSchema = z.object({
  type: z.enum([
    'target-board',
    'ranking-board',
    'results-board',
    'final-board',
    'score-sheet-print',
    'results-list-print',
    'incident-report-print',
    'protest-print',
    'est-backup-source-print',
  ]),
  laneRange: z.object({ from: z.number(), to: z.number() }).optional(),
  competitionId: uuidSchema.optional(),
  eventId: uuidSchema.optional(),
  laneIds: z.array(uuidSchema).optional(),
  championshipName: z.string().optional(),
  venue: z.string().optional(),
  eventName: z.string().optional(),
  relayNumber: z.number().int().positive().optional(),
  round: z.string().optional(),
  eventType: z.string().optional(),
  reportId: uuidSchema.optional(),
  protestId: uuidSchema.optional(),
  sourceId: uuidSchema.optional(),
});

const LiveRankingDtoSchema = z.object({
  rank: z.number().int().positive(),
  laneId: z.string(),
  channel: z.number().int().min(1).max(99),
  playerName: z.string(),
  affiliation: z.string(),
  seriesScores: z.array(z.number().min(0)),
  totalScore: z.number().min(0),
  average: z.number().min(0),
  shotCount: z.number().int().min(0),
  phase: z.enum(['IDLE', 'ACTIVE', 'SHOT_COMPLETE', 'SERIES_COMPLETE', 'STAGE_ENTERED', 'SHOOTOFF', 'FINISHED']),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type OpenTargetBoardPayload = z.infer<typeof OpenTargetBoardPayloadSchema>;
export type OpenResultsBoardPayload = z.infer<typeof OpenResultsBoardPayloadSchema>;
export type OpenFinalBoardPayload = z.infer<typeof OpenFinalBoardPayloadSchema>;
export type OpenScoreSheetPrintPayload = z.infer<typeof OpenScoreSheetPrintPayloadSchema>;
export type OpenResultsListPrintPayload = z.infer<typeof OpenResultsListPrintPayloadSchema>;
export type OpenIncidentReportPrintPayload = z.infer<typeof OpenIncidentReportPrintPayloadSchema>;
export type OpenProtestPrintPayload = z.infer<typeof OpenProtestPrintPayloadSchema>;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export const boardContract = defineContract('board', {
  openTargetBoard: command(OpenTargetBoardPayloadSchema, commandDataResponseSchema(z.string())),
  openRankingBoard: command(commandDataResponseSchema(z.string())),
  openResultsBoard: command(OpenResultsBoardPayloadSchema, commandDataResponseSchema(z.string())),
  openFinalBoard: command(OpenFinalBoardPayloadSchema, commandDataResponseSchema(z.string())),
  openScoreSheetPrint: command(OpenScoreSheetPrintPayloadSchema, commandDataResponseSchema(z.string())),
  openResultsListPrint: command(OpenResultsListPrintPayloadSchema, commandDataResponseSchema(z.string())),
  openIncidentReportPrint: command(OpenIncidentReportPrintPayloadSchema, commandDataResponseSchema(z.string())),
  openProtestPrint: command(OpenProtestPrintPayloadSchema, commandDataResponseSchema(z.string())),
  openEstBackupSourcePrint: command(z.object({ sourceId: uuidSchema }), commandDataResponseSchema(z.string())),
  closeBoard: command(z.string().min(1), CommandResponseSchema),
  getConfig: query(queryResponseSchema(BoardWindowConfigSchema.nullable())),
  getLiveRanking: query(queryResponseSchema(z.array(LiveRankingDtoSchema))),
});
