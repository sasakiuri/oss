import { z } from 'zod';
import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';
import { officialSigningEvidenceSchema } from './officialSigning.schema';
import { reviewSettingsSchema } from './resultPublication.contract';

const scope = z.object({ eventId: z.string().uuid(), resultScope: z.enum(['QUALIFICATION', 'FINAL']) });
const mode = z.enum(['INHERIT', 'PINNED']);
export const publicationReviewPolicyEntrySchema = scope.extend({
  id: z.string().uuid(),
  mode,
  settings: reviewSettingsSchema,
  reason: z.string().trim().min(1).max(2000),
  signingEvidence: officialSigningEvidenceSchema,
  recordedAt: z.string().datetime(),
});
const status = scope.extend({
  mode,
  effectiveSettings: reviewSettingsSchema,
  defaults: reviewSettingsSchema,
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  editable: z.boolean(),
  history: z.array(publicationReviewPolicyEntrySchema),
});
const save = scope.extend({
  mode,
  settings: reviewSettingsSchema,
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(1).max(2000),
  officialName: z.string().trim().min(1).max(200),
});
export type PublicationReviewPolicyEntry = z.infer<typeof publicationReviewPolicyEntrySchema>;
export type PublicationReviewPolicyStatus = z.infer<typeof status>;
export type SavePublicationReviewPolicy = z.infer<typeof save>;
export const publicationReviewPolicyContract = defineContract('publicationReviewPolicy', {
  get: query(scope, queryResponseSchema(status)),
  save: command(save, commandDataResponseSchema(status)),
});
