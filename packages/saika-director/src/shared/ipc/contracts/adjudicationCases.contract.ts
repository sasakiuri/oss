import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuid = z.string().uuid();
const scopeType = z.enum(['EVENT', 'COMPETITION']);
const category = z.enum([
  'SCORING',
  'RANGE_INCIDENT',
  'PROTEST',
  'MALFUNCTION',
  'TARGET_FAILURE',
  'COMMAND_ERROR',
  'FINAL',
  'OTHER',
]);
const entryType = z.enum(['NOTE', 'REFERRED', 'RESOLVED', 'REOPENED', 'CLOSED', 'VOID']);
const artifactType = z.enum([
  'SCORING_DECISION',
  'RANGE_INCIDENT_REPORT',
  'PROTEST',
  'RANGE_INTERRUPTION',
  'TARGET_EXAMINATION',
  'FINAL_OPERATION',
  'FINAL_RECOVERY',
  'OTHER',
]);
const relation = z.enum(['SOURCE', 'EVIDENCE', 'DECISION', 'REPORT', 'PROTEST', 'RECOVERY', 'RELATED']);

const entry = z.object({
  id: uuid,
  caseId: uuid,
  type: entryType,
  statement: z.string().min(1),
  officialName: z.string().min(1),
  ruleReference: z.string().min(1).nullable(),
  occurredAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
});

const link = z.object({
  id: uuid,
  caseId: uuid,
  operation: z.enum(['ADD', 'REMOVE']),
  artifactType,
  artifactId: z.string().min(1),
  relation,
  labelSnapshot: z.string().min(1),
  statement: z.string().min(1),
  officialName: z.string().min(1),
  recordedAt: z.string().datetime(),
  reversesLinkId: uuid.nullable(),
});

const adjudicationCase = z.object({
  id: uuid,
  scopeType,
  scopeId: uuid,
  category,
  subject: z.string().min(1),
  summary: z.string().min(1),
  openedBy: z.string().min(1),
  openedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  status: z.enum(['OPEN', 'REFERRED', 'RESOLVED', 'CLOSED', 'VOID']),
  entries: z.array(entry),
  links: z.array(link),
  linkHistory: z.array(link),
});

const scope = z.object({ scopeType, scopeId: uuid });
const create = scope.extend({
  category,
  subject: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(5000),
  openedBy: z.string().trim().min(1).max(200),
  openedAt: z.string().datetime().optional(),
});
const appendEntry = z.object({
  caseId: uuid,
  type: entryType,
  statement: z.string().trim().min(1).max(5000),
  officialName: z.string().trim().min(1).max(200),
  ruleReference: z.string().trim().min(1).max(500).optional(),
  occurredAt: z.string().datetime().optional(),
});
const linkArtifact = z.object({
  caseId: uuid,
  artifactType,
  artifactId: z.string().trim().min(1).max(500),
  relation,
  labelSnapshot: z.string().trim().min(1).max(500),
  statement: z.string().trim().min(1).max(2000),
  officialName: z.string().trim().min(1).max(200),
});
const unlinkArtifact = z.object({
  caseId: uuid,
  linkId: uuid,
  statement: z.string().trim().min(1).max(2000),
  officialName: z.string().trim().min(1).max(200),
});

export type AdjudicationCaseScopePayload = z.infer<typeof scope>;
export type CreateAdjudicationCasePayload = z.infer<typeof create>;
export type AppendAdjudicationCaseEntryPayload = z.infer<typeof appendEntry>;
export type LinkAdjudicationArtifactPayload = z.infer<typeof linkArtifact>;
export type UnlinkAdjudicationArtifactPayload = z.infer<typeof unlinkArtifact>;
export type AdjudicationCaseDto = z.infer<typeof adjudicationCase>;

export const adjudicationCasesContract = defineContract('adjudicationCases', {
  list: query(scope, queryResponseSchema(z.array(adjudicationCase))),
  create: command(create, commandDataResponseSchema(adjudicationCase)),
  appendEntry: command(appendEntry, commandDataResponseSchema(adjudicationCase)),
  linkArtifact: command(linkArtifact, commandDataResponseSchema(adjudicationCase)),
  unlinkArtifact: command(unlinkArtifact, commandDataResponseSchema(adjudicationCase)),
});
