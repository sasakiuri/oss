import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';

export const DEFAULT_EVIDENCE_FILE_LIMIT = 32 * 1024 * 1024;

export function verifyEvidenceFileContent(bytes: Uint8Array, sha256: string, sizeBytes: number): void {
  if (bytes.byteLength !== sizeBytes) throw new Error('Evidence file size does not match the custody record');
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error('Evidence file SHA-256 mismatch');
}

export function evidenceFileReferences(database: Database.Database): Array<{ sha256: string; sizeBytes: number }> {
  if (!database.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'evidence_files'").get()) {
    return [];
  }
  const rows = database
    .prepare(
      `SELECT DISTINCT json_extract(snapshot_json, '$.sha256') AS sha256,
      json_extract(snapshot_json, '$.sizeBytes') AS sizeBytes FROM evidence_files`,
    )
    .all() as Array<{ sha256: string; sizeBytes: number }>;
  for (const row of rows) {
    if (typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sha256)) {
      throw new Error('Invalid evidence content key in the custody record');
    }
    if (!Number.isSafeInteger(row.sizeBytes) || row.sizeBytes < 0 || row.sizeBytes > DEFAULT_EVIDENCE_FILE_LIMIT) {
      throw new Error('Invalid evidence file size in the custody record');
    }
  }
  return rows;
}

/** A portable database must contain every original referenced by its custody records. */
export function assertEvidenceFileContents(database: Database.Database): void {
  const references = evidenceFileReferences(database);
  if (references.length === 0) return;
  if (!database.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'evidence_file_contents'").get()) {
    throw new Error(
      'This database does not contain its evidence originals. Create a new backup on the original PC after upgrading Director.',
    );
  }
  const read = database.prepare('SELECT content FROM evidence_file_contents WHERE sha256 = ?');
  for (const reference of references) {
    const row = read.get(reference.sha256) as { content: Buffer } | undefined;
    if (!row || !Buffer.isBuffer(row.content)) throw new Error(`Evidence original is missing: ${reference.sha256}`);
    verifyEvidenceFileContent(row.content, reference.sha256, reference.sizeBytes);
  }
}
