import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';
import { FinalRankedResultDtoSchema } from './results.contract';

const uuidSchema = z.string().uuid();
const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);

const FinalPlacementAssignmentDtoSchema = z.object({
  resultId: uuidSchema,
  participantId: z.string().min(1),
  rank: z.number().int().positive(),
});

const FinalPlacementReviewEntryDtoSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  type: z.enum(['REVIEW', 'REVOCATION']),
  scoringRevision: revisionSchema,
  placements: z.array(FinalPlacementAssignmentDtoSchema),
  ruleReference: z.string().min(1),
  statement: z.string().min(1),
  officialName: z.string().min(1),
  recordedAt: z.string().datetime(),
  reversesReviewId: uuidSchema.nullable(),
  active: z.boolean(),
  current: z.boolean(),
});

const FinalPlacementReviewStatusDtoSchema = z.object({
  eventId: uuidSchema,
  scoringRevision: revisionSchema,
  reviewRequired: z.boolean(),
  issues: z.array(z.string()),
  results: z.array(FinalRankedResultDtoSchema),
  currentReview: FinalPlacementReviewEntryDtoSchema.nullable(),
  reviewHistory: z.array(FinalPlacementReviewEntryDtoSchema),
});

const RecordFinalPlacementReviewInputSchema = z
  .object({
    eventId: uuidSchema,
    scoringRevision: revisionSchema,
    placements: z.array(FinalPlacementAssignmentDtoSchema),
    ruleReference: z.string().trim().min(1).max(100),
    statement: z.string().trim().min(1).max(1000),
    officialName: z.string().trim().min(1).max(200),
  })
  .superRefine((input, context) => {
    const resultIds = input.placements.map((placement) => placement.resultId);
    const participantIds = input.placements.map((placement) => placement.participantId);
    const ranks = input.placements.map((placement) => placement.rank);
    if (new Set(resultIds).size !== resultIds.length) {
      context.addIssue({ code: 'custom', path: ['placements'], message: 'Result IDs must be unique' });
    }
    if (new Set(participantIds).size !== participantIds.length) {
      context.addIssue({ code: 'custom', path: ['placements'], message: 'Participant IDs must be unique' });
    }
    if (new Set(ranks).size !== ranks.length) {
      context.addIssue({ code: 'custom', path: ['placements'], message: 'Final ranks must be unique' });
    }
  });

const RevokeFinalPlacementReviewInputSchema = z.object({
  reviewId: uuidSchema,
  ruleReference: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(1000),
  officialName: z.string().trim().min(1).max(200),
});

export type FinalPlacementAssignmentDto = z.infer<typeof FinalPlacementAssignmentDtoSchema>;
export type FinalPlacementReviewEntryDto = z.infer<typeof FinalPlacementReviewEntryDtoSchema>;
export type FinalPlacementReviewStatusDto = z.infer<typeof FinalPlacementReviewStatusDtoSchema>;
export type RecordFinalPlacementReviewPayload = z.infer<typeof RecordFinalPlacementReviewInputSchema>;
export type RevokeFinalPlacementReviewPayload = z.infer<typeof RevokeFinalPlacementReviewInputSchema>;

export const finalPlacementReviewContract = defineContract('finalPlacementReview', {
  getStatus: query(z.object({ eventId: uuidSchema }), queryResponseSchema(FinalPlacementReviewStatusDtoSchema)),
  record: command(RecordFinalPlacementReviewInputSchema, commandDataResponseSchema(FinalPlacementReviewEntryDtoSchema)),
  revoke: command(RevokeFinalPlacementReviewInputSchema, commandDataResponseSchema(FinalPlacementReviewEntryDtoSchema)),
});
