import { z } from 'zod';
import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const assignment = z.object({
  relayNumber: z.number().int().positive(),
  firingPointNumber: z.number().int().positive(),
  participantId: z.string().uuid(),
});
const finding = z.object({
  code: z.string(),
  severity: z.enum(['INFO', 'WARNING']),
  message: z.string(),
  ruleReference: z.string(),
});
const ledgerEntry = z.object({
  id: z.string().uuid(),
  officialName: z.string(),
  statement: z.string(),
  recordedAt: z.string().datetime(),
});
const draw = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  competitionTypeId: z.string(),
  seed: z.string(),
  algorithmVersion: z.string(),
  relayCount: z.number().int().positive(),
  firstFiringPoint: z.number().int().positive(),
  firingPointCount: z.number().int().positive(),
  statusSectionPolicy: z.enum(['OFF', 'END_OF_RELAY']),
  participantSnapshotHash: z.string(),
  outputHash: z.string(),
  assignments: z.array(assignment),
  findings: z.array(finding),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  approval: ledgerEntry.nullable(),
  application: ledgerEntry.nullable(),
  voidEntry: ledgerEntry.nullable(),
  stale: z.boolean(),
});

const createDraw = z.object({
  eventId: z.string().uuid(),
  competitionTypeId: z.string().min(1),
  seed: z.string().trim().min(1).max(200),
  relayCount: z.number().int().min(1).max(99),
  firstFiringPoint: z.number().int().min(1).max(999),
  firingPointCount: z.number().int().min(1).max(999),
  statusSectionPolicy: z.enum(['OFF', 'END_OF_RELAY']).default('OFF'),
  createdBy: z.string().trim().min(1).max(200),
  createdAt: z.string().datetime().optional(),
});
const entryInput = z.object({
  drawId: z.string().uuid(),
  officialName: z.string().trim().min(1).max(200),
  statement: z.string().trim().min(1).max(2000),
  recordedAt: z.string().datetime().optional(),
});

export type SquaddingAssignmentDto = z.infer<typeof assignment>;
export type SquaddingFindingDto = z.infer<typeof finding>;
export type SquaddingDrawDto = z.infer<typeof draw>;
export type CreateSquaddingDrawPayload = z.infer<typeof createDraw>;
export type SquaddingDrawEntryPayload = z.infer<typeof entryInput>;

export const squaddingContract = defineContract('squadding', {
  list: query(z.object({ eventId: z.string().uuid() }), queryResponseSchema(z.array(draw))),
  createDraw: command(createDraw, commandDataResponseSchema(draw)),
  approve: command(entryInput, commandDataResponseSchema(draw)),
  apply: command(entryInput, commandDataResponseSchema(draw)),
  voidDraw: command(entryInput, commandDataResponseSchema(draw)),
});
