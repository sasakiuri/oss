import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuidSchema = z.string().uuid();
const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
const evidenceSourceSchema = z.enum(['TARGET_PRINTOUT', 'INDEPENDENT_MEMORY', 'OTHER']);
const comparisonStatusSchema = z.enum(['MATCHED', 'MISMATCH', 'UNAVAILABLE']);

const ResultVerificationCheckDtoSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  resultId: uuidSchema,
  participantId: z.string().min(1),
  playerName: z.string().min(1),
  resultRevision: revisionSchema,
  resultRank: z.number().int().positive(),
  scoreX10: z.number().int().nonnegative(),
  decisionCountAtCheck: z.number().int().nonnegative(),
  evidenceSource: evidenceSourceSchema,
  evidenceReference: z.string().min(1),
  comparisonStatus: comparisonStatusSchema,
  manualInterventionsReviewed: z.boolean(),
  note: z.string().nullable(),
  officialName: z.string().min(1),
  checkedAt: z.string().datetime(),
  current: z.boolean(),
  qualifies: z.boolean(),
});

const ResultListApprovalDtoSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  resultScope: z.enum(['QUALIFICATION', 'FINAL']),
  type: z.enum(['APPROVAL', 'REVOCATION']),
  snapshotRevision: revisionSchema,
  requiredIndividualChecks: z.number().int().nonnegative(),
  requiredTeamChecks: z.number().int().nonnegative(),
  checkIds: z.array(uuidSchema),
  statement: z.string().min(1),
  officialName: z.string().min(1),
  recordedAt: z.string().datetime(),
  reversesApprovalId: uuidSchema.nullable(),
  active: z.boolean(),
  current: z.boolean(),
});

const VerificationResultItemDtoSchema = z.object({
  resultId: uuidSchema,
  participantId: z.string().min(1),
  revision: revisionSchema,
  rank: z.number().int().nonnegative(),
  playerName: z.string(),
  affiliation: z.string(),
  relayNumber: z.number().int().positive(),
  totalScore: z.number().nonnegative(),
  classificationCode: z.enum(['DSQ', 'DQB', 'AD_DSQ']).nullable(),
  decisionCount: z.number().int().nonnegative(),
  projectionIssues: z.array(z.string()),
  status: z.enum(['published', 'confirmed']),
  evidenceSummary: z.object({
    expectedShots: z.number().int().nonnegative(),
    linkedShots: z.number().int().nonnegative(),
    independentDecimalShots: z.number().int().nonnegative(),
    innerTenClassifiedShots: z.number().int().nonnegative(),
  }),
  required: z.boolean(),
  latestCheck: ResultVerificationCheckDtoSchema.nullable(),
  currentCheck: ResultVerificationCheckDtoSchema.nullable(),
});

const ResultVerificationStatusDtoSchema = z.object({
  eventId: uuidSchema,
  snapshotRevision: revisionSchema,
  configuredIndividualChecks: z.number().int().nonnegative(),
  requiredIndividualChecks: z.number().int().nonnegative(),
  requiredTeamChecks: z.number().int().nonnegative(),
  teamVerificationSupported: z.boolean(),
  checkedIndividualResults: z.number().int().nonnegative(),
  allResultsConfirmed: z.boolean(),
  readyForApproval: z.boolean(),
  issues: z.array(z.string()),
  results: z.array(VerificationResultItemDtoSchema),
  currentApproval: ResultListApprovalDtoSchema.nullable(),
  approvalHistory: z.array(ResultListApprovalDtoSchema),
});

const AddVerificationCheckInputSchema = z.object({
  eventId: uuidSchema,
  resultId: uuidSchema,
  resultRevision: revisionSchema,
  evidenceSource: evidenceSourceSchema,
  evidenceReference: z.string().trim().min(1).max(300),
  comparisonStatus: comparisonStatusSchema,
  manualInterventionsReviewed: z.boolean(),
  note: z.string().trim().min(1).max(2000).optional(),
  officialName: z.string().trim().min(1).max(200),
});

const ApproveResultListInputSchema = z.object({
  eventId: uuidSchema,
  snapshotRevision: revisionSchema,
  statement: z.string().trim().min(1).max(1000),
  officialName: z.string().trim().min(1).max(200),
});

const RevokeResultListApprovalInputSchema = z.object({
  approvalId: uuidSchema,
  reason: z.string().trim().min(1).max(1000),
  officialName: z.string().trim().min(1).max(200),
});

export type ResultVerificationCheckDto = z.infer<typeof ResultVerificationCheckDtoSchema>;
export type ResultListApprovalDto = z.infer<typeof ResultListApprovalDtoSchema>;
export type VerificationResultItemDto = z.infer<typeof VerificationResultItemDtoSchema>;
export type ResultVerificationStatusDto = z.infer<typeof ResultVerificationStatusDtoSchema>;
export type AddVerificationCheckPayload = z.infer<typeof AddVerificationCheckInputSchema>;
export type ApproveResultListPayload = z.infer<typeof ApproveResultListInputSchema>;
export type RevokeResultListApprovalPayload = z.infer<typeof RevokeResultListApprovalInputSchema>;

export const resultVerificationContract = defineContract('resultVerification', {
  getStatus: query(z.object({ eventId: uuidSchema }), queryResponseSchema(ResultVerificationStatusDtoSchema)),
  addCheck: command(AddVerificationCheckInputSchema, commandDataResponseSchema(ResultVerificationCheckDtoSchema)),
  approve: command(ApproveResultListInputSchema, commandDataResponseSchema(ResultListApprovalDtoSchema)),
  revokeApproval: command(RevokeResultListApprovalInputSchema, commandDataResponseSchema(ResultListApprovalDtoSchema)),
});
