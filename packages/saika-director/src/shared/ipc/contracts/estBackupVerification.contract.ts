import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const resultKind = z.enum(['INDIVIDUAL', 'TEAM', 'MIXED_TEAM']);
const keyType = z.enum(['PARTICIPANT_ID', 'START_NUMBER', 'ISSF_ID', 'TEAM_ID']);
const columnName = z.string().trim().min(1).max(100);
const columnMapping = z
  .object({
    delimiter: z.enum([',', ';', '\t']),
    decimalSeparator: z.enum(['.', ',']),
    keyColumn: columnName,
    totalScoreColumn: columnName,
    rankColumn: columnName.nullable(),
    shotScoreColumns: z.array(columnName).max(1000).optional(),
    seriesScoreColumns: z.array(columnName).max(1000).optional(),
  })
  .refine((value) => {
    const columns = [
      value.keyColumn,
      value.totalScoreColumn,
      value.rankColumn,
      ...(value.shotScoreColumns ?? []),
      ...(value.seriesScoreColumns ?? []),
    ].filter((column) => column !== null);
    return new Set(columns).size === columns.length;
  }, 'Select different columns for key, total score, and rank');
const scoreDetails = {
  shotScores: z.array(z.number().finite()).max(1000).optional(),
  seriesScores: z.array(z.number().finite()).max(1000).optional(),
};
const backupRecord = z.object({
  ...scoreDetails,
  key: z.string().trim().min(1).max(200),
  rank: z.number().int().positive().nullable().optional(),
  totalScore: z.number(),
});
export const EstBackupColumnMappingSchema = columnMapping;
const item = z.object({
  detailChecks: z
    .array(
      z.object({
        kind: z.enum(['SERIES', 'SHOTS']),
        required: z.boolean(),
        status: z.enum(['MATCH', 'MISMATCH', 'MISSING', 'UNAVAILABLE', 'NOT_REQUESTED']),
        values: z.array(
          z.object({
            position: z.number().int().positive(),
            official: z.number().nullable(),
            backup: z.number().nullable(),
          }),
        ),
      }),
    )
    .optional(),
  key: z.string(),
  name: z.string(),
  officialRank: z.number().int().positive().nullable(),
  backupRank: z.number().int().positive().nullable(),
  officialTotalScore: z.number().nullable(),
  backupTotalScore: z.number().nullable(),
  status: z.enum(['MATCH', 'MISMATCH', 'MISSING', 'EXTRA']),
  interventionCount: z.number().int().nonnegative(),
  resultBinding: z
    .object({
      resultId: z.string().uuid(),
      participantId: z.string().min(1),
      resultRevision: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .optional(),
});
const run = z.object({
  sourceId: z.string().uuid().nullable().optional(),
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  resultScope: z.enum(['QUALIFICATION', 'FINAL']).optional(),
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
  detailRequirement: z.enum(['AVAILABLE', 'SERIES', 'SHOTS', 'BOTH']).optional(),
  sourceId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  eventId: z.string().uuid(),
  resultScope: z.enum(['QUALIFICATION', 'FINAL']).optional(),
  resultKind,
  keyType,
  sourceName: z.string().trim().min(1).max(200),
  sourceReference: z.string().trim().min(1).max(4000).optional(),
  records: z.array(backupRecord).min(1).max(1000),
  interventionReviewStatement: z.string().trim().min(1).max(2000).optional(),
  officialName: z.string().trim().min(1).max(200),
  verifiedAt: z.string().datetime().optional(),
});
const importReceipt = z.discriminatedUnion('status', [
  z.object({ status: z.literal('CANCELLED') }),
  z.object({
    status: z.literal('IMPORTED'),
    sourceId: z.string().uuid().optional(),
    fileName: z.string().min(1).max(255),
    sizeBytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    format: z.string().trim().min(1).max(100),
    sourceName: z.string().trim().min(1).max(200),
    sourceReference: z.string().trim().min(1).max(4000),
    records: z.array(backupRecord).min(1).max(1000),
  }),
]);

export type CreateEstBackupVerificationPayload = z.infer<typeof create>;
export type EstBackupColumnMappingDto = z.infer<typeof columnMapping>;
export type EstBackupVerificationRunDto = z.infer<typeof run>;
export type EstBackupRecordImportReceiptDto = z.infer<typeof importReceipt>;

export const EstBackupSourceSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  sourceName: z.string().min(1).max(200),
  sourceReference: z.string().min(1).max(4000),
  sizeBytes: z
    .number()
    .int()
    .nonnegative()
    .max(2 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  recordsSha256: z.string().regex(/^[a-f0-9]{64}$/),
  format: z.string().min(1).max(100),
  content: z.string().max(2 * 1024 * 1024),
  records: z.array(backupRecord).min(1).max(1000),
  recordCount: z.number().int().positive(),
  importedAt: z.string().datetime(),
});
const sourceSummary = EstBackupSourceSchema.omit({ content: true, records: true });
export type EstBackupSourceDto = z.infer<typeof EstBackupSourceSchema>;
export type EstBackupSourceSummaryDto = z.infer<typeof sourceSummary>;

const snapshotMode = z.enum(['STABLE_READS', 'COMPLETE_FILES']);
const captureStatus = z.object({
  eventId: z.string().uuid(),
  runId: z.string().uuid().nullable(),
  state: z.enum(['STOPPED', 'WAITING', 'READING', 'READY', 'ERROR']),
  sourceLabel: z.string().nullable(),
  intervalMilliseconds: z.number().int().positive().nullable(),
  snapshotMode: snapshotMode.nullable(),
  resumeOnStartup: z.boolean(),
  canResume: z.boolean(),
  checkedAt: z.string().datetime().nullable(),
  capturedAt: z.string().datetime().nullable(),
  retainedSourceCheckedAt: z.string().datetime().nullable(),
  sourceId: z.string().uuid().nullable(),
  error: z.string().nullable(),
});
const captureRun = z.object({ eventId: z.string().uuid(), runId: z.string().uuid() });
export type EstBackupCaptureStatusDto = z.infer<typeof captureStatus>;

const checkRequest = z.object({ eventId: z.string().uuid(), runId: z.string().uuid() });
const checkPreview = checkRequest.extend({
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  items: z.array(
    z.object({
      key: z.string(),
      resultId: z.string().uuid().nullable(),
      name: z.string(),
      rank: z.number(),
      totalScore: z.number(),
      interventionCount: z.number(),
      state: z.enum(['READY', 'ALREADY_VERIFIED', 'BLOCKED']),
      issue: z.string().nullable(),
    }),
  ),
});
const applyChecks = checkRequest.extend({
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  resultIds: z
    .array(z.string().uuid())
    .min(1)
    .max(1000)
    .refine((ids) => new Set(ids).size === ids.length),
  evidenceSource: z.enum(['TARGET_PRINTOUT', 'INDEPENDENT_MEMORY']),
  manualInterventionsReviewed: z.literal(true),
  statement: z.string().trim().min(1).max(1500),
  officialName: z.string().trim().min(1).max(200),
});
const checkReceipt = z.object({
  items: z.array(
    z.object({
      resultId: z.string().uuid(),
      state: z.enum(['CREATED', 'ALREADY_VERIFIED', 'FAILED']),
      checkId: z.string().uuid().nullable(),
      issue: z.string().nullable(),
    }),
  ),
});
export type EstBackupCheckPreviewDto = z.infer<typeof checkPreview>;
export type ApplyEstBackupChecksPayload = z.infer<typeof applyChecks>;
export type EstBackupCheckReceiptDto = z.infer<typeof checkReceipt>;

export const estBackupVerificationContract = defineContract('estBackupVerification', {
  getCapture: query(z.object({ eventId: z.string().uuid() }), queryResponseSchema(captureStatus)),
  startCapture: command(
    z.object({
      eventId: z.string().uuid(),
      mapping: columnMapping.optional(),
      intervalMilliseconds: z.number().int().min(1000).max(300_000),
      snapshotMode: snapshotMode.optional(),
      resumeOnStartup: z.boolean().optional(),
    }),
    commandDataResponseSchema(captureStatus),
  ),
  stopCapture: command(captureRun, commandDataResponseSchema(captureStatus)),
  resumeCapture: command(z.object({ eventId: z.string().uuid() }), commandDataResponseSchema(captureStatus)),
  forgetCapture: command(z.object({ eventId: z.string().uuid() }), commandDataResponseSchema(captureStatus)),
  checkCapture: command(captureRun, commandDataResponseSchema(captureStatus)),
  captureRecords: command(
    z.object({ eventId: z.string().uuid(), mapping: columnMapping.optional() }),
    commandDataResponseSchema(importReceipt),
  ),
  listSources: query(z.object({ eventId: z.string().uuid() }), queryResponseSchema(z.array(sourceSummary))),
  getSource: query(z.object({ sourceId: z.string().uuid() }), queryResponseSchema(EstBackupSourceSchema)),
  previewChecks: query(checkRequest, queryResponseSchema(checkPreview)),
  applyChecks: command(applyChecks, commandDataResponseSchema(checkReceipt)),
  list: query(z.object({ eventId: z.string().uuid() }), queryResponseSchema(z.array(run))),
  importRecords: command(commandDataResponseSchema(importReceipt)),
  importDelimitedRecords: command(columnMapping, commandDataResponseSchema(importReceipt)),
  verify: command(create, commandDataResponseSchema(run)),
});
