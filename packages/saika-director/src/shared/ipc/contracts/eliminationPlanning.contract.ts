import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuid = z.string().uuid();
const entry = z.object({
  id: uuid,
  entryType: z.enum(['APPROVED', 'QUOTAS_ANNOUNCED', 'VOID']),
  officialName: z.string().min(1),
  statement: z.string().min(1),
  recordedAt: z.string().datetime(),
});
const plan = z.object({
  id: uuid,
  eventId: uuid,
  competitionTypeId: z.string().min(1),
  rulePackIdentity: z.object({
    id: z.string().min(1),
    schemaVersion: z.literal(1),
    fingerprint: z.object({ algorithm: z.literal('SHA-256'), value: z.string().regex(/^[a-f0-9]{64}$/) }),
  }),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  entryCount: z.number().int().positive(),
  usableFiringPoints: z.number().int().positive(),
  relayStartCounts: z.array(z.number().int().positive()),
  status: z.enum(['NOT_REQUIRED', 'REQUIRED', 'PLANNED', 'WAIVED']),
  eliminationRequired: z.boolean(),
  minimumRelayCount: z.number().int().positive(),
  qualificationPlaces: z.number().int().positive(),
  relayQuotas: z.array(
    z.object({
      relayNumber: z.number().int().positive(),
      startCount: z.number().int().positive(),
      rawQuota: z.number().nonnegative(),
      qualifyCount: z.number().int().nonnegative(),
    }),
  ),
  findings: z.array(
    z.object({
      code: z.string().min(1),
      severity: z.enum(['INFO', 'WARNING', 'BLOCKING']),
      message: z.string().min(1),
      ruleReference: z.string().min(1),
    }),
  ),
  waiver: z
    .object({
      authorityRole: z.literal('TECHNICAL_DELEGATE'),
      officialName: z.string().min(1),
      reason: z.literal('SCHEDULE_LIMITATIONS'),
      statement: z.string().min(1),
    })
    .nullable(),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  stale: z.boolean(),
  approval: entry.nullable(),
  quotaAnnouncement: entry.nullable(),
  voidEntry: entry.nullable(),
});
const createPlan = z.object({
  eventId: uuid,
  usableFiringPoints: z.number().int().positive(),
  createdBy: z.string().trim().min(1).max(200),
  waiver: z
    .object({
      authorityRole: z.literal('TECHNICAL_DELEGATE'),
      officialName: z.string().trim().min(1).max(200),
      reason: z.literal('SCHEDULE_LIMITATIONS'),
      statement: z.string().trim().min(1).max(5000),
    })
    .optional(),
});
const planEntry = z.object({
  planId: uuid,
  officialName: z.string().trim().min(1).max(200),
  statement: z.string().trim().min(1).max(5000),
});

export type OutdoorEliminationPlanDto = z.infer<typeof plan>;
export type CreateOutdoorEliminationPlanPayload = z.infer<typeof createPlan>;
export type OutdoorEliminationPlanEntryPayload = z.infer<typeof planEntry>;

export const eliminationPlanningContract = defineContract('eliminationPlanning', {
  list: query(z.object({ eventId: uuid }), queryResponseSchema(z.array(plan))),
  create: command(createPlan, commandDataResponseSchema(plan)),
  approve: command(planEntry, commandDataResponseSchema(plan)),
  announceQuotas: command(planEntry, commandDataResponseSchema(plan)),
  voidPlan: command(planEntry, commandDataResponseSchema(plan)),
});
