import { z } from 'zod';
import {
  defineContract,
  command,
  query,
  CommandResponseSchema,
  commandDataResponseSchema,
  queryResponseSchema,
} from '../defineContract';

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();
const scoreSchema = z.number().min(0).max(10.9);
const uniqueLaneIdsSchema = z
  .array(uuidSchema)
  .min(2)
  .refine((laneIds) => new Set(laneIds).size === laneIds.length, 'Lane IDs must be unique');

const ActiveShootoffSchema = z.object({
  shootoffId: uuidSchema,
  contestedRank: z.number().int().positive(),
  currentRound: z.number().int().min(0),
  isResolved: z.boolean(),
  participantIds: z.array(z.string()).min(2),
});

const StartShootoffResponseSchema = z.object({
  shootoffId: uuidSchema,
});

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Payload types (inferred from contract input schemas)
// ---------------------------------------------------------------------------

export interface StartShootoffPayload {
  eventId: string;
  targetLaneIds: string[];
  contestedRank: number;
}

export interface AddShotPayload {
  shootoffId: string;
  laneId: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export const shootoffContract = defineContract('shootoff', {
  start: command(
    z.object({
      eventId: uuidSchema,
      targetLaneIds: uniqueLaneIdsSchema,
      contestedRank: z.number().int().min(1),
    }),
    commandDataResponseSchema(StartShootoffResponseSchema),
  ),
  addShot: command(
    z.object({
      shootoffId: uuidSchema,
      laneId: uuidSchema,
      score: scoreSchema,
    }),
    CommandResponseSchema,
    { channel: 'shootoff:add-shot' },
  ),
  completeRound: command(z.object({ shootoffId: uuidSchema }), CommandResponseSchema, {
    channel: 'shootoff:complete-round',
  }),
  resolve: command(
    z.object({
      shootoffId: uuidSchema,
      rankedLaneIds: uniqueLaneIdsSchema,
    }),
    CommandResponseSchema,
  ),
  getActive: query(z.object({ eventId: uuidSchema }), queryResponseSchema(ActiveShootoffSchema.nullable()), {
    channel: 'shootoff:get-active',
  }),
});
