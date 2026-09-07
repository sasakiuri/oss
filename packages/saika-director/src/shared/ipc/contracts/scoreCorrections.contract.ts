// SPDX-License-Identifier: MIT
import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuid = z.string().uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const target = z.object({ resultId: uuid, resultScope: z.enum(['QUALIFICATION', 'FINAL']) });
const official = { officialName: z.string().trim().min(1).max(200), statement: z.string().trim().min(1).max(2000) };
const ranking = z.object({
  shotId: z.string().nullable(),
  ringScore: z.number(),
  decimalScore: z.number().nullable(),
  innerTen: z.boolean().nullable(),
  seriesIndex: z.number().int().nonnegative(),
  decimalScoreSource: z.enum(['DEVICE']).nullable().optional(),
  innerTenSource: z.enum(['CALCULATED']).nullable().optional(),
  scoreConflict: z.boolean().optional(),
});
const shot = z.object({ scoreX10: z.number().int(), ranking });
const basis = target.extend({
  eventId: uuid,
  participantId: uuid,
  relayNumber: z.number().int().positive(),
  competitionId: uuid.nullable(),
  sourceRevision: digest,
  seriesShotCounts: z.array(z.number()),
  shots: z.array(shot),
  issues: z.array(z.string()),
});
const request = target.extend({
  caseId: uuid,
  decisionId: uuid,
  ...official,
  changes: z
    .array(
      z.object({
        operation: z.enum(['REPLACE', 'INSERT_MISSING']),
        shotIndex: z.number().int().nonnegative(),
        scoreX10: z.number().int().min(0).max(109),
        decimalScore: z.number().min(0).max(10.9).nullable(),
        innerTen: z.boolean().nullable(),
        sourceShotId: z.string().trim().min(1).nullable(),
        evidenceReference: z.string().trim().min(1).max(1000),
      }),
    )
    .min(1)
    .max(100),
});
const preview = z.object({ request, basis, caseRevision: digest, shots: z.array(shot), digest });
const application = preview.extend({ id: uuid, recordedAt: z.string().datetime() });
const withdrawalInput = z.object({ id: uuid, applicationId: uuid, ...official });
const withdrawal = withdrawalInput.extend({ recordedAt: z.string().datetime() });
const workspace = z.object({
  basis,
  scoring: z.enum(['RING', 'DECIMAL', 'HIT_MISS']),
  cases: z.array(z.object({ id: uuid, summary: z.string(), decisionId: uuid, decision: z.string() })),
  history: z.array(z.object({ application, withdrawal: withdrawal.nullable() })),
  projection: z.object({
    shots: z.array(shot),
    revision: z.string(),
    ids: z.array(z.string()),
    remarks: z.array(z.string()),
    issues: z.array(z.string()),
  }),
});
export type ScoreCorrectionRequestDto = z.infer<typeof request>;
export type ScoreCorrectionPreviewDto = z.infer<typeof preview>;
export type ScoreCorrectionWorkspaceDto = z.infer<typeof workspace>;
export const scoreCorrectionsContract = defineContract('scoreCorrections', {
  workspace: query(target, queryResponseSchema(workspace)),
  preview: query(request, queryResponseSchema(preview)),
  apply: command(
    z.object({ id: uuid, request, expectedDigest: digest, confirmed: z.literal(true) }),
    commandDataResponseSchema(application),
  ),
  withdraw: command(withdrawalInput, commandDataResponseSchema(withdrawal)),
});
