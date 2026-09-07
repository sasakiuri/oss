import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuidSchema = z.string().uuid();
const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
const resultScopeSchema = z.enum(['QUALIFICATION', 'FINAL']);
const statusSchema = z.enum(['DRAFT', 'PRELIMINARY', 'PROTEST_PENDING', 'PROTEST_CLOSED', 'OFFICIAL']);

const entryBase = {
  id: uuidSchema,
  eventId: uuidSchema,
  resultScope: resultScopeSchema,
  preliminaryId: uuidSchema,
  recordedAt: z.string().datetime(),
};

const ResultPublicationEntryDtoSchema = z.discriminatedUnion('type', [
  z.object({
    ...entryBase,
    type: z.literal('PRELIMINARY_PUBLISHED'),
    snapshotRevision: revisionSchema,
    postedAt: z.string().datetime(),
    protestEndsAt: z.string().datetime(),
    officialName: z.string().min(1),
  }),
  z.object({
    ...entryBase,
    type: z.literal('PROTEST_REGISTERED'),
    protestReference: z.string().min(1),
  }),
  z.object({
    ...entryBase,
    type: z.literal('PROTEST_RESOLVED'),
    protestReference: z.string().min(1),
    resolution: z.string().min(1),
    officialName: z.string().min(1),
  }),
  z.object({
    ...entryBase,
    type: z.literal('OFFICIAL_PUBLISHED'),
    snapshotRevision: revisionSchema,
    approvalId: uuidSchema,
    officialName: z.string().min(1),
  }),
]);

const ResultPublicationStatusDtoSchema = z.object({
  eventId: uuidSchema,
  resultScope: resultScopeSchema,
  status: statusSchema,
  preliminaryId: uuidSchema.nullable(),
  publicationSnapshotRevision: revisionSchema.nullable(),
  currentSnapshotRevision: revisionSchema.nullable(),
  publicationCurrent: z.boolean(),
  postedAt: z.string().datetime().nullable(),
  protestEndsAt: z.string().datetime().nullable(),
  openProtestReferences: z.array(z.string().min(1)),
  officialPublishedAt: z.string().datetime().nullable(),
  approvalId: uuidSchema.nullable(),
  canRegisterProtest: z.boolean(),
  canPublishOfficial: z.boolean(),
  issues: z.array(z.string()),
  history: z.array(ResultPublicationEntryDtoSchema),
});

const FinalResultDeclarationDtoSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  snapshotRevision: revisionSchema,
  approvalId: uuidSchema,
  finalProtestsResolved: z.literal(true),
  resultProcessConfirmed: z.literal(true),
  statement: z.string().min(1),
  officialName: z.string().min(1),
  ruleReference: z.string().min(1),
  declaredAt: z.string().datetime(),
});

const FinalResultDeclarationStatusDtoSchema = z.object({
  eventId: uuidSchema,
  currentSnapshotRevision: revisionSchema.nullable(),
  currentApprovalId: uuidSchema.nullable(),
  declaration: FinalResultDeclarationDtoSchema.nullable(),
  declarationCurrent: z.boolean(),
  canDeclare: z.boolean(),
  issues: z.array(z.string()),
});

const eventScopeInput = z.object({ eventId: uuidSchema, resultScope: resultScopeSchema });
const officialNameSchema = z.string().trim().min(1).max(200);

export type ResultPublicationEntryDto = z.infer<typeof ResultPublicationEntryDtoSchema>;
export type ResultPublicationStatusDto = z.infer<typeof ResultPublicationStatusDtoSchema>;
export type PublishPreliminaryResultsPayload = z.infer<typeof PublishPreliminaryResultsInputSchema>;
export type RegisterResultProtestPayload = z.infer<typeof RegisterResultProtestInputSchema>;
export type ResolveResultProtestPayload = z.infer<typeof ResolveResultProtestInputSchema>;
export type PublishOfficialResultsPayload = z.infer<typeof PublishOfficialResultsInputSchema>;
export type FinalResultDeclarationDto = z.infer<typeof FinalResultDeclarationDtoSchema>;
export type FinalResultDeclarationStatusDto = z.infer<typeof FinalResultDeclarationStatusDtoSchema>;
export type DeclareFinalResultsPayload = z.infer<typeof DeclareFinalResultsInputSchema>;

const PublishPreliminaryResultsInputSchema = eventScopeInput.extend({ officialName: officialNameSchema });
const RegisterResultProtestInputSchema = eventScopeInput.extend({
  protestReference: z.string().trim().min(1).max(200),
});
const ResolveResultProtestInputSchema = RegisterResultProtestInputSchema.extend({
  resolution: z.string().trim().min(1).max(2000),
  officialName: officialNameSchema,
});
const PublishOfficialResultsInputSchema = eventScopeInput.extend({ officialName: officialNameSchema });
const DeclareFinalResultsInputSchema = z.object({
  eventId: uuidSchema,
  finalProtestsResolved: z.boolean(),
  resultProcessConfirmed: z.boolean(),
  statement: z.string().trim().min(1).max(1000),
  officialName: officialNameSchema,
});

const reviewSettingsSchema = z.object({
  requireIncidentReports: z.boolean(),
  requireFinalRecoveriesComplete: z.boolean(),
});
export type ResultPublicationReviewSettingsDto = z.infer<typeof reviewSettingsSchema>;

export const resultPublicationContract = defineContract('resultPublication', {
  getReviewSettings: query(queryResponseSchema(reviewSettingsSchema)),
  setReviewSettings: command(reviewSettingsSchema, commandDataResponseSchema(reviewSettingsSchema)),
  getStatus: query(eventScopeInput, queryResponseSchema(ResultPublicationStatusDtoSchema)),
  publishPreliminary: command(
    PublishPreliminaryResultsInputSchema,
    commandDataResponseSchema(ResultPublicationStatusDtoSchema),
  ),
  registerProtest: command(
    RegisterResultProtestInputSchema,
    commandDataResponseSchema(ResultPublicationStatusDtoSchema),
  ),
  resolveProtest: command(ResolveResultProtestInputSchema, commandDataResponseSchema(ResultPublicationStatusDtoSchema)),
  publishOfficial: command(
    PublishOfficialResultsInputSchema,
    commandDataResponseSchema(ResultPublicationStatusDtoSchema),
  ),
  getFinalDeclarationStatus: query(
    z.object({ eventId: uuidSchema }),
    queryResponseSchema(FinalResultDeclarationStatusDtoSchema),
  ),
  declareFinal: command(
    DeclareFinalResultsInputSchema,
    commandDataResponseSchema(FinalResultDeclarationStatusDtoSchema),
  ),
});
