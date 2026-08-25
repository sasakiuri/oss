/**
 * Lane Control IPC Contract ()
 *
 * Self-contained contract for unified lane control IPC procedures.
 * All Zod schemas are defined inline — no imports from ipcSchemas.ts.
 *
 * NOTE: Channel names use kebab-case (e.g. `unified-lane-control:get-all`),
 * so every procedure uses the `channel` override option.
 */
import { z } from 'zod';
import { defineContract, command, query, CommandResponseSchema, queryResponseSchema } from '../defineContract';

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();
const scoreSchema = z.number().min(0).max(10.9);
const shotIndexSchema = z.number().int().min(0);
const laneIdsSchema = z
  .array(uuidSchema)
  .min(1)
  .refine((laneIds) => new Set(laneIds).size === laneIds.length, 'Lane IDs must be unique');
const channelSchema = z.number().int().min(1).max(99);
const shotTypeSchema = z.enum(['PREPARATION', 'MATCH']);
const lanePhaseSchema = z.enum([
  'IDLE',
  'ACTIVE',
  'SHOT_COMPLETE',
  'SERIES_COMPLETE',
  'STAGE_ENTERED',
  'SHOOTOFF',
  'FINISHED',
]);

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const LaneIdsPayloadSchema = z.object({
  laneIds: laneIdsSchema,
});

const AssignPlayersPayloadSchema = z.object({
  eventType: z.string(),
  assignments: z
    .array(
      z.object({
        channel: channelSchema,
        playerName: z.string(),
        affiliation: z.string(),
        participantId: z.string().optional(),
        logoPath: z.string().optional(),
        relayNumber: z.number().int().positive().optional(),
      }),
    )
    .min(1)
    .superRefine((assignments, context) => {
      if (new Set(assignments.map(({ channel }) => channel)).size !== assignments.length) {
        context.addIssue({ code: 'custom', message: 'Assignment channels must be unique' });
      }
      const participantIds = assignments.flatMap(({ participantId }) => (participantId ? [participantId] : []));
      if (new Set(participantIds).size !== participantIds.length) {
        context.addIssue({ code: 'custom', message: 'Assigned participant IDs must be unique' });
      }
    }),
});

const MoveLanePayloadSchema = z.object({
  fromLaneId: uuidSchema,
  toLaneId: uuidSchema,
});

const EditShotPayloadSchema = z.object({
  laneId: uuidSchema,
  shotIndex: shotIndexSchema,
  newScore: scoreSchema,
  shotType: shotTypeSchema,
});

const DeleteShotPayloadSchema = z.object({
  laneId: uuidSchema,
  shotIndex: shotIndexSchema,
  shotType: shotTypeSchema,
});

const InsertShotPayloadSchema = z.object({
  laneId: uuidSchema,
  shotIndex: shotIndexSchema,
  score: scoreSchema,
  shotType: shotTypeSchema,
});

const EliminatePayloadSchema = z.object({
  laneId: uuidSchema,
  rank: z.number().int().min(1),
});

// ---------------------------------------------------------------------------
// DTO schemas (response types for queries)
// ---------------------------------------------------------------------------

const LaneControlDtoSchema = z.object({
  id: z.string(),
  channel: channelSchema,
  player: z
    .object({
      name: z.string(),
      affiliation: z.string(),
      participantId: z.string().optional(),
    })
    .nullable(),
  phase: lanePhaseSchema,
  unifiedPhase: lanePhaseSchema,
  stageIndex: z.number().int().min(0),
  seriesIndex: z.number().int().min(0),
  roundType: z.string(),
  stageName: z.string(),
  timer: z
    .object({
      remainingSeconds: z.number().min(0),
      totalSeconds: z.number().min(0),
    })
    .nullable(),
  preparationShots: z.array(scoreSchema),
  matchShots: z.array(scoreSchema),
  shootoffShots: z.array(scoreSchema),
  eliminated: z.boolean(),
  eliminationRank: z.number().int().positive().nullable(),
  totalScore: z.number().min(0),
  stage1Total: z.number().min(0),
  stage2Total: z.number().min(0),
  seriesScores: z.array(z.number().min(0)),
  recentShots: z.array(scoreSchema),
  shotNumber: z.number().int().min(0),
  lastScore: scoreSchema.nullable(),
  lastShotTime: z.number().min(0).nullable(),
  remainingTime: z.number().min(0),
  relayNumber: z.number().int().positive(),
});

export interface ShotDto {
  shotNumber: number;
  score: number;
  seriesNumber: number;
}

const ScoreSheetShotDtoSchema = z.object({
  shotNumber: z.number(),
  value: z.number(),
  integerValue: z.number(),
  seriesNumber: z.number(),
});

const ScoreSheetDtoSchema = z.object({
  laneId: z.string(),
  channel: z.number(),
  relay: z.number(),
  playerName: z.string(),
  affiliation: z.string(),
  allShots: z.array(ScoreSheetShotDtoSchema),
  seriesScores: z.array(z.number()),
  totalScore: z.number(),
  totalIntegerScore: z.number(),
  eventName: z.string().optional(),
  championshipName: z.string().optional(),
  venue: z.string().optional(),
});

const GetScoreSheetsResponseSchema = z.object({
  success: z.boolean(),
  scoreSheets: z.array(ScoreSheetDtoSchema),
  error: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Inferred types (replacing legacy IpcPayloads/IpcResponses interfaces)
// ---------------------------------------------------------------------------

// DTO types
export type ScoreSheetShotDto = z.infer<typeof ScoreSheetShotDtoSchema>;
export type ScoreSheetDto = z.infer<typeof ScoreSheetDtoSchema>;
export type GetScoreSheetsResponse = z.infer<typeof GetScoreSheetsResponseSchema>;

// Input payloads

export type AssignPlayersPayload = z.infer<typeof AssignPlayersPayloadSchema>;
export type MoveLanePayload = z.infer<typeof MoveLanePayloadSchema>;
export type EditShotPayload = z.infer<typeof EditShotPayloadSchema>;
export type DeleteShotPayload = z.infer<typeof DeleteShotPayloadSchema>;
export type InsertShotPayload = z.infer<typeof InsertShotPayloadSchema>;
export type EliminatePayload = z.infer<typeof EliminatePayloadSchema>;

// ---------------------------------------------------------------------------
// Contract definition
// ---------------------------------------------------------------------------

export const laneControlContract = defineContract('unified-lane-control', {
  // Queries
  getAll: query(z.void(), queryResponseSchema(z.array(LaneControlDtoSchema)), {
    channel: 'unified-lane-control:get-all',
  }),

  // Commands
  startPreparation: command(LaneIdsPayloadSchema, CommandResponseSchema, {
    channel: 'unified-lane-control:start-preparation',
  }),
  advanceStage: command(LaneIdsPayloadSchema, CommandResponseSchema, { channel: 'unified-lane-control:advance-stage' }),
  startSeries: command(LaneIdsPayloadSchema, CommandResponseSchema, { channel: 'unified-lane-control:start-series' }),
  finish: command(LaneIdsPayloadSchema, CommandResponseSchema, { channel: 'unified-lane-control:finish' }),
  clear: command(LaneIdsPayloadSchema, CommandResponseSchema, { channel: 'unified-lane-control:clear' }),
  assignPlayers: command(AssignPlayersPayloadSchema, CommandResponseSchema, {
    channel: 'unified-lane-control:assign-players',
  }),
  moveLane: command(MoveLanePayloadSchema, CommandResponseSchema, { channel: 'unified-lane-control:move-lane' }),
  editShot: command(EditShotPayloadSchema, CommandResponseSchema, { channel: 'unified-lane-control:edit-shot' }),
  deleteShot: command(DeleteShotPayloadSchema, CommandResponseSchema, { channel: 'unified-lane-control:delete-shot' }),
  insertShot: command(InsertShotPayloadSchema, CommandResponseSchema, { channel: 'unified-lane-control:insert-shot' }),
  eliminate: command(EliminatePayloadSchema, CommandResponseSchema, { channel: 'unified-lane-control:eliminate' }),
  getScoreSheets: query(
    z.object({ laneIds: z.array(z.string().uuid()).min(1) }),
    queryResponseSchema(GetScoreSheetsResponseSchema),
    { channel: 'laneControl:getScoreSheets' },
  ),
});
