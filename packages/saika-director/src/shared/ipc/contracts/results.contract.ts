import { z } from 'zod';
import { defineContract, command, query, queryResponseSchema, commandDataResponseSchema } from '../defineContract';

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();
const uniqueUuidArraySchema = z
  .array(uuidSchema)
  .min(1)
  .refine((ids) => new Set(ids).size === ids.length, 'IDs must be unique');

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

const PublishResultsResponseSchema = z.object({
  savedCount: z.number(),
  errors: z.array(z.string()),
});

const ConfirmResultsResponseSchema = z.object({
  confirmedCount: z.number(),
});

const RankedResultDtoSchema = z.object({
  id: z.string(),
  participantId: z.string(),
  rank: z.number(),
  playerName: z.string(),
  familyName: z.string(),
  affiliation: z.string(),
  relayNumber: z.number(),
  seriesScores: z.array(z.number()),
  baseTotalScore: z.number(),
  totalScore: z.number(),
  scoreAdjustment: z.number().nonnegative(),
  deductionTotal: z.number().nonnegative(),
  remarks: z.array(z.string()),
  classificationCode: z.enum(['DSQ', 'DQB', 'AD_DSQ']).nullable(),
  decisionCount: z.number().int().nonnegative(),
  projectionIssues: z.array(z.string()),
  evidenceSummary: z.object({
    expectedShots: z.number().int().nonnegative(),
    linkedShots: z.number().int().nonnegative(),
    independentDecimalShots: z.number().int().nonnegative(),
    innerTenClassifiedShots: z.number().int().nonnegative(),
    scoreConflicts: z.number().int().nonnegative(),
  }),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  confirmedAt: z.string(),
  status: z.enum(['published', 'confirmed']),
});

export const FinalRankedResultDtoSchema = z.object({
  id: z.string(),
  participantId: z.string(),
  sourceRank: z.number().int().positive(),
  rank: z.number(),
  playerName: z.string(),
  affiliation: z.string(),
  firingPointNumber: z.number(),
  stage1Shots: z.array(z.number()),
  stage1Total: z.number(),
  stage2Shots: z.array(z.number()),
  stage2Total: z.number(),
  seriesScores: z.array(z.number()),
  seriesShotCounts: z.array(z.number().int().positive()),
  baseTotalScore: z.number(),
  totalScore: z.number(),
  scoreAdjustment: z.number().nonnegative(),
  deductionTotal: z.number().nonnegative(),
  classificationCode: z.enum(['DSQ', 'DQB', 'AD_DSQ']).nullable(),
  decisionCount: z.number().int().nonnegative(),
  projectionIssues: z.array(z.string()),
  scoringRevision: z.string().regex(/^[a-f0-9]{64}$/),
  placementReviewId: uuidSchema.nullable(),
  placementReviewRequired: z.boolean(),
  eliminatedAtShot: z.number().optional(),
  shootoffId: z.string().optional(),
  remarks: z.string(),
  status: z.enum(['in_progress', 'eliminated', 'finished']),
});

const GetRelayResultsResponseSchema = z.object({
  eventId: z.string(),
  relayNumber: z.number(),
  results: z.array(RankedResultDtoSchema),
});

const GetEventResultsResponseSchema = z.object({
  eventId: z.string(),
  results: z.array(RankedResultDtoSchema),
});

const GetFinalEventResultsResponseSchema = z.object({
  eventId: z.string(),
  results: z.array(FinalRankedResultDtoSchema),
});

// ---------------------------------------------------------------------------
// Inferred types (replacing legacy IpcResponses interfaces)
// ---------------------------------------------------------------------------

export type RankedResultDto = z.infer<typeof RankedResultDtoSchema>;
export type FinalRankedResultDto = z.infer<typeof FinalRankedResultDtoSchema>;
export type PublishResultsResponse = z.infer<typeof PublishResultsResponseSchema>;
export type ConfirmResultsResponse = z.infer<typeof ConfirmResultsResponseSchema>;
export type GetRelayResultsResponse = z.infer<typeof GetRelayResultsResponseSchema>;
export type GetEventResultsResponse = z.infer<typeof GetEventResultsResponseSchema>;
export type GetFinalEventResultsResponse = z.infer<typeof GetFinalEventResultsResponseSchema>;

// ---------------------------------------------------------------------------
// Payload types (inferred from contract input schemas)
// ---------------------------------------------------------------------------

export type PublishResultsPayload = { eventId: string; laneIds: string[] };
export type ConfirmResultsPayload = { eventId: string; resultIds: string[] };
export type GetEventResultsPayload = { eventId: string };
export type GetRelayResultsPayload = { eventId: string; relayNumber: number };
export type GetFinalEventResultsPayload = { eventId: string };

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export const resultsContract = defineContract('results', {
  publish: command(
    z.object({ eventId: uuidSchema, laneIds: uniqueUuidArraySchema }),
    commandDataResponseSchema(PublishResultsResponseSchema),
  ),
  publishFinal: command(
    z.object({ eventId: uuidSchema, laneIds: uniqueUuidArraySchema }),
    commandDataResponseSchema(PublishResultsResponseSchema),
  ),
  confirm: command(
    z.object({ eventId: uuidSchema, resultIds: uniqueUuidArraySchema }),
    commandDataResponseSchema(ConfirmResultsResponseSchema),
  ),
  getByRelay: query(
    z.object({ eventId: uuidSchema, relayNumber: z.number().int().positive() }),
    queryResponseSchema(GetRelayResultsResponseSchema),
  ),
  getByEvent: query(z.object({ eventId: uuidSchema }), queryResponseSchema(GetEventResultsResponseSchema)),
  getFinalByEvent: query(z.object({ eventId: uuidSchema }), queryResponseSchema(GetFinalEventResultsResponseSchema)),
});
