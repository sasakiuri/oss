import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuidSchema = z.string().uuid();
const scopeTypeSchema = z.enum(['COMPETITION', 'EVENT']);
const issueKindSchema = z.enum([
  'SIGHTING_COMPLAINT',
  'NO_SHOT_INDICATION',
  'UNEXPECTED_ZERO',
  'SCORE_VALUE_PROTEST',
  'PAPER_OR_RUBBER_FAILURE',
  'SINGLE_TARGET_FAILURE',
  'RANGE_TARGET_FAILURE',
  'OTHER',
]);
const evidenceTypeSchema = z.enum([
  'CONTROL_SHEET',
  'BACKING_CARD',
  'BACKING_TARGET',
  'WITNESS_STRIP',
  'RUBBER_BAND',
  'RANGE_INCIDENT_REPORT',
  'EST_LOG_PRINT',
  'EST_COMPUTER_RECORD',
  'TARGET_FACE',
  'OTHER',
]);
const entryTypeSchema = z.enum(['NOTE', 'DECISION', 'HOLD_RELEASED', 'HOLD_REINSTATED', 'CLOSED', 'REOPENED', 'VOID']);

const TargetExaminationScopeDtoSchema = z.object({
  id: uuidSchema,
  caseId: uuidSchema,
  scopeType: scopeTypeSchema,
  scopeId: z.string().min(1),
  linkedBy: z.string().min(1),
  note: z.string().min(1).nullable(),
  linkedAt: z.string().datetime(),
});

const TargetExaminationEvidenceDtoSchema = z.object({
  id: uuidSchema,
  caseId: uuidSchema,
  type: evidenceTypeSchema,
  description: z.string().min(1),
  reference: z.string().min(1).nullable(),
  contentHashSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  collectedBy: z.string().min(1),
  collectedAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
});

const TargetExaminationEntryDtoSchema = z.object({
  id: uuidSchema,
  caseId: uuidSchema,
  type: entryTypeSchema,
  statement: z.string().min(1),
  ruleReference: z.string().min(1).nullable(),
  officialName: z.string().min(1),
  recordedAt: z.string().datetime(),
});

const TargetExaminationCaseDtoSchema = z.object({
  id: uuidSchema,
  issueKind: issueKindSchema,
  occurredAt: z.string().datetime(),
  laneId: z.string().min(1).nullable(),
  firingPointNumber: z.number().int().positive().nullable(),
  relayNumber: z.number().int().positive().nullable(),
  athleteName: z.string().min(1).nullable(),
  shotId: z.string().min(1).nullable(),
  summary: z.string().min(1),
  details: z.string().min(1),
  ruleReferences: z.string().min(1),
  openedBy: z.string().min(1),
  createdAt: z.string().datetime(),
  scopes: z.array(TargetExaminationScopeDtoSchema).min(1),
  evidence: z.array(TargetExaminationEvidenceDtoSchema),
  entries: z.array(TargetExaminationEntryDtoSchema),
  status: z.enum(['OPEN', 'CLOSED', 'VOID']),
  evidenceHoldActive: z.boolean(),
  workflow: z.object({
    policyId: z.string().min(1),
    advisoryOnly: z.literal(true),
    readyForJuryDecision: z.boolean(),
    steps: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        ruleReference: z.string().min(1),
        status: z.enum(['COMPLETE', 'MISSING', 'MANUAL_CONFIRMATION']),
        guidance: z.string().min(1),
      }),
    ),
  }),
});

const ScopeInputSchema = z.object({
  scopeType: scopeTypeSchema,
  scopeId: z.string().trim().min(1).max(200),
});

const CreateTargetExaminationCaseInputSchema = z
  .object({
    scopes: z.array(ScopeInputSchema).min(1).max(4),
    issueKind: issueKindSchema,
    occurredAt: z.string().datetime(),
    laneId: z.string().trim().min(1).max(200).optional(),
    firingPointNumber: z.number().int().positive().optional(),
    relayNumber: z.number().int().positive().optional(),
    athleteName: z.string().trim().min(1).max(300).optional(),
    shotId: z.string().trim().min(1).max(200).optional(),
    summary: z.string().trim().min(1).max(300),
    details: z.string().trim().min(1).max(5000),
    ruleReferences: z.string().trim().min(1).max(500),
    openedBy: z.string().trim().min(1).max(200),
  })
  .superRefine((value, context) => {
    const keys = value.scopes.map((scope) => `${scope.scopeType}:${scope.scopeId}`);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: 'custom', path: ['scopes'], message: 'Scope links must be unique' });
    }
  });

const LinkTargetExaminationScopeInputSchema = z.object({
  caseId: uuidSchema,
  scope: ScopeInputSchema,
  linkedBy: z.string().trim().min(1).max(200),
  note: z.string().trim().min(1).max(1000).optional(),
});

const AddTargetExaminationEvidenceInputSchema = z.object({
  caseId: uuidSchema,
  type: evidenceTypeSchema,
  description: z.string().trim().min(1).max(2000),
  reference: z.string().trim().min(1).max(1000).optional(),
  contentHashSha256: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
  collectedBy: z.string().trim().min(1).max(200),
  collectedAt: z.string().datetime(),
});

const entryBase = {
  caseId: uuidSchema,
  statement: z.string().trim().min(1).max(3000),
  officialName: z.string().trim().min(1).max(200),
};

const AppendTargetExaminationEntryInputSchema = z.discriminatedUnion('type', [
  z.object({ ...entryBase, type: z.literal('NOTE'), ruleReference: z.string().trim().min(1).max(500).optional() }),
  z.object({ ...entryBase, type: z.literal('DECISION'), ruleReference: z.string().trim().min(1).max(500) }),
  z.object({
    ...entryBase,
    type: z.literal('HOLD_RELEASED'),
    ruleReference: z.string().trim().min(1).max(500).optional(),
  }),
  z.object({
    ...entryBase,
    type: z.literal('HOLD_REINSTATED'),
    ruleReference: z.string().trim().min(1).max(500).optional(),
  }),
  z.object({ ...entryBase, type: z.literal('CLOSED'), ruleReference: z.string().trim().min(1).max(500).optional() }),
  z.object({ ...entryBase, type: z.literal('REOPENED'), ruleReference: z.string().trim().min(1).max(500).optional() }),
  z.object({ ...entryBase, type: z.literal('VOID'), ruleReference: z.string().trim().min(1).max(500).optional() }),
]);

export type TargetExaminationScopeTypeDto = z.infer<typeof scopeTypeSchema>;
export type TargetExaminationIssueKindDto = z.infer<typeof issueKindSchema>;
export type TargetExaminationEvidenceTypeDto = z.infer<typeof evidenceTypeSchema>;
export type TargetExaminationEntryTypeDto = z.infer<typeof entryTypeSchema>;
export type TargetExaminationScopeDto = z.infer<typeof TargetExaminationScopeDtoSchema>;
export type TargetExaminationEvidenceDto = z.infer<typeof TargetExaminationEvidenceDtoSchema>;
export type TargetExaminationEntryDto = z.infer<typeof TargetExaminationEntryDtoSchema>;
export type TargetExaminationCaseDto = z.infer<typeof TargetExaminationCaseDtoSchema>;
export type TargetExaminationScopePayload = z.infer<typeof ScopeInputSchema>;
export type CreateTargetExaminationCasePayload = z.infer<typeof CreateTargetExaminationCaseInputSchema>;
export type LinkTargetExaminationScopePayload = z.infer<typeof LinkTargetExaminationScopeInputSchema>;
export type AddTargetExaminationEvidencePayload = z.infer<typeof AddTargetExaminationEvidenceInputSchema>;
export type AppendTargetExaminationEntryPayload = z.infer<typeof AppendTargetExaminationEntryInputSchema>;

export const targetExaminationsContract = defineContract('targetExaminations', {
  listAll: query(queryResponseSchema(z.array(TargetExaminationCaseDtoSchema))),
  listByScope: query(ScopeInputSchema, queryResponseSchema(z.array(TargetExaminationCaseDtoSchema))),
  getById: query(z.object({ caseId: uuidSchema }), queryResponseSchema(TargetExaminationCaseDtoSchema)),
  create: command(CreateTargetExaminationCaseInputSchema, commandDataResponseSchema(TargetExaminationCaseDtoSchema)),
  linkScope: command(LinkTargetExaminationScopeInputSchema, commandDataResponseSchema(TargetExaminationCaseDtoSchema)),
  addEvidence: command(
    AddTargetExaminationEvidenceInputSchema,
    commandDataResponseSchema(TargetExaminationCaseDtoSchema),
  ),
  appendEntry: command(
    AppendTargetExaminationEntryInputSchema,
    commandDataResponseSchema(TargetExaminationCaseDtoSchema),
  ),
});
