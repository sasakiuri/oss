import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const cancelled = z.object({ status: z.literal('CANCELLED') });
const backupInspection = z.object({
  path: z.string().min(1),
  fileName: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  sha256,
  schemaVersion: z.number().int().nonnegative(),
  championshipCount: z.number().int().nonnegative(),
  integrityOk: z.boolean(),
  inspectedAt: z.string().datetime(),
});
const evidenceReceipt = z.discriminatedUnion('status', [
  cancelled,
  z.object({
    status: z.literal('COMPLETED'),
    path: z.string().min(1),
    fileName: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    bundleSha256: sha256,
    sections: z.array(z.object({ id: z.string().min(1), recordCount: z.number().int().nonnegative(), sha256 })),
    generatedAt: z.string().datetime(),
  }),
]);
const backupReceipt = z.discriminatedUnion('status', [
  cancelled,
  z.object({ status: z.literal('COMPLETED'), inspection: backupInspection }),
]);
const restoreCandidate = z.discriminatedUnion('status', [
  cancelled,
  z.object({
    status: z.literal('READY'),
    candidateToken: z.string().uuid(),
    inspection: backupInspection,
    compatible: z.boolean(),
    compatibilityIssues: z.array(z.string()),
  }),
]);
const pendingRestore = z.object({
  sourceFileName: z.string().min(1),
  stagedSha256: sha256,
  schemaVersion: z.number().int().nonnegative(),
  stagedAt: z.string().datetime(),
  recoveryCopyWillBeCreated: z.literal(true),
});

export type DatabaseBackupInspectionDto = z.infer<typeof backupInspection>;
export type EvidenceBundleReceiptDto = z.infer<typeof evidenceReceipt>;
export type DatabaseBackupReceiptDto = z.infer<typeof backupReceipt>;
export type RestoreCandidateDto = z.infer<typeof restoreCandidate>;
export type PendingRestoreDto = z.infer<typeof pendingRestore>;

export const operationalArchivesContract = defineContract('operationalArchives', {
  exportCompetitionEvidence: command(
    z.object({ championshipId: z.string().uuid() }),
    commandDataResponseSchema(evidenceReceipt),
  ),
  createDatabaseBackup: command(commandDataResponseSchema(backupReceipt)),
  inspectRestoreCandidate: command(commandDataResponseSchema(restoreCandidate)),
  scheduleRestore: command(
    z.object({ candidateToken: z.string().uuid(), confirmation: z.literal(true) }),
    commandDataResponseSchema(pendingRestore),
  ),
  getPendingRestore: query(queryResponseSchema(pendingRestore.nullable())),
  cancelPendingRestore: command(commandDataResponseSchema(z.object({ cancelled: z.boolean() }))),
});
