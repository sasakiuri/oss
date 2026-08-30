import { z } from 'zod';
import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const entry = z.object({
  id: z.string().uuid(),
  entryType: z.enum(['CLOSED', 'VOID']),
  officialName: z.string(),
  statement: z.string(),
  recordedAt: z.string().datetime(),
});
const session = z.object({
  id: z.string().uuid(),
  competitionId: z.string().uuid(),
  requestingTeamId: z.string(),
  courtesyTeamIds: z.array(z.string()),
  requestedByRole: z.enum(['COACH', 'ATHLETE']),
  requestedByName: z.string(),
  afterShot: z.number().int().min(1).max(24),
  durationSeconds: z.literal(30),
  officialName: z.string(),
  statement: z.string(),
  startedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  closedEntry: entry.nullable(),
  voidEntry: entry.nullable(),
  active: z.boolean(),
});
const start = z.object({
  competitionId: z.string().uuid(),
  requestingTeamId: z.string().min(1),
  courtesyTeamIds: z.array(z.string().min(1)).default([]),
  requestedByRole: z.enum(['COACH', 'ATHLETE']),
  requestedByName: z.string().trim().min(1).max(200),
  afterShot: z.number().int().min(1).max(24),
  officialName: z.string().trim().min(1).max(200),
  statement: z.string().trim().min(1).max(2000),
  startedAt: z.string().datetime().optional(),
});
const append = z.object({
  timeoutId: z.string().uuid(),
  officialName: z.string().trim().min(1).max(200),
  statement: z.string().trim().min(1).max(2000),
  recordedAt: z.string().datetime().optional(),
});

export type MixedTeamTimeoutDto = z.infer<typeof session>;
export type StartMixedTeamTimeoutPayload = z.infer<typeof start>;
export type AppendMixedTeamTimeoutPayload = z.infer<typeof append>;

export const mixedTeamTimeoutsContract = defineContract('mixedTeamTimeouts', {
  list: query(z.object({ competitionId: z.string().uuid() }), queryResponseSchema(z.array(session))),
  start: command(start, commandDataResponseSchema(session)),
  close: command(append, commandDataResponseSchema(session)),
  voidTimeout: command(append, commandDataResponseSchema(session)),
});
