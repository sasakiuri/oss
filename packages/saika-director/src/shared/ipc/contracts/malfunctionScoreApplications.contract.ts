import { z } from 'zod';
import { defineContract, query, command, queryResponseSchema, commandDataResponseSchema } from '../defineContract';

const uuid = z.string().uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const official = {
  officialName: z.string().trim().min(1).max(200),
  officialRole: z.enum(['RTS_OFFICER', 'JURY_MEMBER']),
  statement: z.string().trim().min(1).max(2000),
};
const request = z.object({ sheetId: uuid, innerTens: z.array(z.boolean()).length(5), ...official });
const preview = z.object({
  request,
  caseId: uuid,
  eventId: uuid,
  participantId: uuid,
  relayNumber: z.number().int().positive(),
  resultId: uuid,
  sourceDigest: digest,
  seriesIndex: z.number().int().nonnegative(),
  originalScoresX10: z.array(z.number().int()).length(5),
  sheetDigest: digest,
  digest,
  replacement: z.object({
    sourceDigest: digest,
    seriesIndex: z.number().int().nonnegative(),
    shotsX10: z.array(z.number().int()).length(5),
    publicRemark: z.string(),
    rankingShots: z
      .array(
        z.object({
          shotId: z.string().nullable(),
          ringScore: z.number(),
          decimalScore: z.number().nullable(),
          innerTen: z.boolean().nullable(),
          seriesIndex: z.number().int().nonnegative(),
        }),
      )
      .length(5),
  }),
});
const application = preview.extend({ id: uuid, recordedAt: z.string().datetime() });
const withdrawalInput = z.object({ id: uuid, applicationId: uuid, ...official });
const withdrawal = withdrawalInput.extend({ recordedAt: z.string().datetime() });
const historyItem = z.object({ application, withdrawal: withdrawal.nullable() });
export type MalfunctionScoreApplicationRequestDto = z.infer<typeof request>;
export type MalfunctionScoreApplicationPreviewDto = z.infer<typeof preview>;
export type MalfunctionScoreApplicationHistoryDto = z.infer<typeof historyItem>;
export const malfunctionScoreApplicationsContract = defineContract('malfunctionScoreApplications', {
  list: query(z.object({ caseId: uuid }), queryResponseSchema(z.array(historyItem))),
  preview: query(request, queryResponseSchema(preview)),
  apply: command(
    z.object({ id: uuid, request, expectedDigest: digest, confirmed: z.literal(true) }),
    commandDataResponseSchema(application),
  ),
  withdraw: command(withdrawalInput, commandDataResponseSchema(withdrawal)),
});
