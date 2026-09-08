import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuid = z.string().uuid();
const scopeType = z.enum(['COMPETITION', 'EVENT']);
const kind = z.enum(['VERBAL', 'WRITTEN', 'FINAL_VERBAL', 'APPEAL']);
const entryType = z.enum([
  'FORWARDED_TO_JURY',
  'DECIDED_UPHELD',
  'DECIDED_PARTLY_UPHELD',
  'DECIDED_REJECTED',
  'FEE_REFUNDED',
  'FEE_RETAINED',
  'NOTE',
  'CLOSED',
  'VOID',
]);
const scope = z.object({ scopeType, scopeId: z.string().min(1) });
const entry = z.object({
  id: uuid,
  caseId: uuid,
  type: entryType,
  statement: z.string(),
  officialName: z.string(),
  ruleReference: z.string().nullable(),
  occurredAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
});
const protest = z.object({
  id: uuid,
  scopeType,
  scopeId: z.string(),
  kind,
  parentProtestId: uuid.nullable(),
  subject: z.string(),
  statement: z.string(),
  lodgedBy: z.string(),
  lodgedAt: z.string().datetime(),
  triggeringDecisionAt: z.string().datetime().nullable(),
  formReference: z.string().nullable(),
  feePaidEuro: z.number().int().nonnegative().nullable(),
  lateAcceptanceReason: z.string().nullable(),
  openedBy: z.string(),
  createdAt: z.string().datetime(),
  status: z.enum(['OPEN', 'DECIDED', 'CLOSED', 'VOID']),
  compliance: z.object({
    deadlineAt: z.string().datetime().nullable(),
    withinDeadline: z.boolean().nullable(),
    expectedFeeEuro: z.number().int().nonnegative(),
    formRequired: z.boolean(),
    appealPermitted: z.boolean(),
    issues: z.array(z.string()),
    ruleReferences: z.string(),
  }),
  entries: z.array(entry),
});

const create = scope.extend({
  id: uuid.optional(),
  kind,
  parentProtestId: uuid.nullable().optional(),
  subject: z.string().trim().min(1).max(300),
  statement: z.string().trim().min(1).max(5000),
  lodgedBy: z.string().trim().min(1).max(200),
  lodgedAt: z.string().datetime(),
  triggeringDecisionAt: z.string().datetime().nullable().optional(),
  formReference: z.string().trim().min(1).max(200).nullable().optional(),
  feePaidEuro: z.number().int().nonnegative().nullable().optional(),
  lateAcceptanceReason: z.string().trim().min(1).max(1000).nullable().optional(),
  openedBy: z.string().trim().min(1).max(200),
});
const recordEntry = z.object({
  caseId: uuid,
  type: entryType,
  statement: z.string().trim().min(1).max(5000),
  officialName: z.string().trim().min(1).max(200),
  ruleReference: z.string().trim().min(1).max(500).nullable().optional(),
  occurredAt: z.string().datetime(),
});

export type ProtestScopePayload = z.infer<typeof scope>;
export type CreateProtestPayload = z.infer<typeof create>;
export type RecordProtestEntryPayload = z.infer<typeof recordEntry>;
export type ProtestCaseDto = z.infer<typeof protest>;

export const protestsContract = defineContract('protests', {
  list: query(scope, queryResponseSchema(z.array(protest))),
  getById: query(z.object({ caseId: uuid }), queryResponseSchema(protest)),
  create: command(create, commandDataResponseSchema(protest)),
  recordEntry: command(recordEntry, commandDataResponseSchema(protest)),
});
