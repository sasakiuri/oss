import { z } from 'zod';
import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const resultKind = z.enum(['INDIVIDUAL', 'TEAM', 'MIXED_TEAM']);
const keyType = z.enum(['PARTICIPANT_ID', 'START_NUMBER', 'ISSF_ID', 'TEAM_ID']);
const backupRecord = z.object({
  key: z.string().trim().min(1).max(200),
  rank: z.number().int().positive().nullable().optional(),
  totalScore: z.number(),
});
const item = z.object({
  key: z.string(),
  name: z.string(),
  officialRank: z.number().int().positive().nullable(),
  backupRank: z.number().int().positive().nullable(),
  officialTotalScore: z.number().nullable(),
  backupTotalScore: z.number().nullable(),
  status: z.enum(['MATCH', 'MISMATCH', 'MISSING', 'EXTRA']),
  interventionCount: z.number().int().nonnegative(),
});
const run = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  resultKind,
  keyType,
  sourceName: z.string(),
  sourceReference: z.string().nullable(),
  items: z.array(item),
  snapshotRevision: z.string().regex(/^[a-f0-9]{64}$/),
  interventionReviewStatement: z.string().nullable(),
  verified: z.boolean(),
  officialName: z.string(),
  verifiedAt: z.string().datetime(),
});
const create = z.object({
  id: z.string().uuid().optional(),
  eventId: z.string().uuid(),
  resultKind,
  keyType,
  sourceName: z.string().trim().min(1).max(200),
  sourceReference: z.string().trim().min(1).max(500).optional(),
  records: z.array(backupRecord).min(1).max(1000),
  interventionReviewStatement: z.string().trim().min(1).max(2000).optional(),
  officialName: z.string().trim().min(1).max(200),
  verifiedAt: z.string().datetime().optional(),
});
const importReceipt = z.discriminatedUnion('status', [
  z.object({ status: z.literal('CANCELLED') }),
  z.object({
    status: z.literal('IMPORTED'),
    fileName: z.string().min(1).max(255),
    sizeBytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    format: z.string().trim().min(1).max(100),
    sourceName: z.string().trim().min(1).max(200),
    sourceReference: z.string().trim().min(1).max(500),
    records: z.array(backupRecord).min(1).max(1000),
  }),
]);

export type CreateEstBackupVerificationPayload = z.infer<typeof create>;
export type EstBackupVerificationRunDto = z.infer<typeof run>;
export type EstBackupRecordImportReceiptDto = z.infer<typeof importReceipt>;

export const estBackupVerificationContract = defineContract('estBackupVerification', {
  list: query(z.object({ eventId: z.string().uuid() }), queryResponseSchema(z.array(run))),
  importRecords: command(commandDataResponseSchema(importReceipt)),
  verify: command(create, commandDataResponseSchema(run)),
});
