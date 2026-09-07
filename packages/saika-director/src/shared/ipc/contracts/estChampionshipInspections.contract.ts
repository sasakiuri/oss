import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuid = z.string().uuid();
const startSettings = z.object({
  competitionId: uuid,
  championshipId: uuid.nullable(),
  mode: z.enum(['DISABLED', 'ADVISORY', 'REQUIRED']),
  laneTargets: z
    .array(
      z.object({
        laneId: uuid,
        targetIdentifiers: z.array(z.string().trim().min(1).max(200)).min(1).max(5).readonly(),
      }),
    )
    .max(500)
    .readonly(),
});
export type EstInspectionStartSettingsDto = z.infer<typeof startSettings>;
const outcome = z.enum(['PASSED', 'FAILED']);
const entry = z.object({
  id: uuid,
  planId: uuid,
  targetIdentifier: z.string().min(1),
  outcome,
  statement: z.string().min(1),
  evidenceReference: z.string().nullable(),
  performedBy: z.string().min(1),
  technicalDelegateName: z.string().min(1),
  inspectedAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
  revokedEntryId: uuid.nullable(),
});
const plan = z.object({
  id: uuid,
  championshipId: uuid,
  versionNumber: z.number().int().positive(),
  targetIdentifiers: z.array(z.string().min(1)),
  methodStatement: z.string().min(1),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
});
const assessment = z.object({
  plan: plan.nullable(),
  ready: z.boolean(),
  ruleReference: z.literal('ISSF 6.3.2.8'),
  targets: z.array(
    z.object({
      targetIdentifier: z.string().min(1),
      status: z.enum(['PENDING', 'PASSED', 'FAILED']),
      latestEntry: entry.nullable(),
    }),
  ),
  history: z.array(entry),
});
const createPlan = z.object({
  championshipId: uuid,
  targetIdentifiers: z.array(z.string().trim().min(1).max(200)).min(1).max(500),
  methodStatement: z.string().trim().min(1).max(5000),
  createdBy: z.string().trim().min(1).max(200),
});
const record = z.object({
  planId: uuid,
  targetIdentifiers: z.array(z.string().trim().min(1).max(200)).min(1).max(500),
  outcome,
  statement: z.string().trim().min(1).max(5000),
  evidenceReference: z.string().trim().min(1).max(1000).optional(),
  performedBy: z.string().trim().min(1).max(200),
  technicalDelegateName: z.string().trim().min(1).max(200),
  inspectedAt: z.string().datetime(),
});
const revoke = z.object({
  planId: uuid,
  entryId: uuid,
  statement: z.string().trim().min(1).max(5000),
  performedBy: z.string().trim().min(1).max(200),
  technicalDelegateName: z.string().trim().min(1).max(200),
});

export type EstChampionshipInspectionAssessmentDto = z.infer<typeof assessment>;
export type CreateEstInspectionPlanPayload = z.infer<typeof createPlan>;
export type RecordEstInspectionPayload = z.infer<typeof record>;
export type RevokeEstInspectionPayload = z.infer<typeof revoke>;

export const estChampionshipInspectionsContract = defineContract('estChampionshipInspections', {
  getStartSettings: query(z.object({ competitionId: uuid }), queryResponseSchema(startSettings)),
  setStartSettings: command(startSettings, commandDataResponseSchema(startSettings)),
  get: query(z.object({ championshipId: uuid }), queryResponseSchema(assessment)),
  createPlan: command(createPlan, commandDataResponseSchema(assessment)),
  record: command(record, commandDataResponseSchema(assessment)),
  revoke: command(revoke, commandDataResponseSchema(assessment)),
});
