import { z } from 'zod';
import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';
const uuid = z.string().uuid();
const subject = z.object({
  id: z.string(),
  competitionId: uuid,
  laneId: uuid,
  kind: z.string(),
  occurredAt: z.string().datetime(),
  detail: z.string(),
  evidenceReference: z.string(),
  revision: z.string(),
});
const input = z.object({
  id: uuid,
  competitionId: uuid,
  subjectId: z.string().min(1),
  subjectRevision: z.string().min(1),
  previousReviewId: uuid.nullable(),
  action: z.enum(['NO_SCORE_CHANGE', 'SCORE_CORRECTION', 'REOPEN']),
  correctionId: uuid.nullable(),
  officialName: z.string().trim().min(1).max(200),
  statement: z.string().trim().min(1).max(5000),
});
const review = input.extend({ recordedAt: z.string().datetime() });
const item = z.object({
  subject,
  reviews: z.array(review),
  latest: review.nullable(),
  resolved: z.boolean(),
  issue: z.string().nullable(),
});
export type ObservationReviewItemDto = z.infer<typeof item>;
export const observationReviewsContract = defineContract('observationReviews', {
  listEvent: query(
    z.object({ eventId: uuid, resultScope: z.enum(['QUALIFICATION', 'FINAL']) }),
    queryResponseSchema(z.array(item)),
  ),
  list: query(z.object({ competitionId: uuid }), queryResponseSchema(z.array(item))),
  record: command(input, commandDataResponseSchema(z.array(item))),
});
