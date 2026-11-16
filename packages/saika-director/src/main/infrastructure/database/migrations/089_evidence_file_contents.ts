import { createHash } from 'node:crypto';
import { closeSync, fstatSync, openSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type Database from 'better-sqlite3';

import type { Migration } from './Migration';

// Frozen copies of the evidence helpers this migration was published with; keep them unchanged.
function verifyEvidenceFileContent(bytes: Uint8Array, sha256: string, sizeBytes: number): void {
  if (bytes.byteLength !== sizeBytes) throw new Error('Evidence file size does not match the custody record');
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error('Evidence file SHA-256 mismatch');
}

function evidenceFileReferences(database: Database.Database): Array<{ sha256: string; sizeBytes: number }> {
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
    if (!Number.isSafeInteger(row.sizeBytes) || row.sizeBytes < 0 || row.sizeBytes > 32 * 1024 * 1024) {
      throw new Error('Invalid evidence file size in the custody record');
    }
  }
  return rows;
}

export const migration089EvidenceFileContents: Migration = {
  version: 89,
  name: 'evidence_file_contents',
  up(db) {
    db.exec(`CREATE TABLE evidence_file_contents (
      sha256 TEXT PRIMARY KEY,
      content BLOB NOT NULL CHECK (typeof(content) = 'blob')
    );
    CREATE TRIGGER evidence_file_contents_no_update BEFORE UPDATE ON evidence_file_contents
    BEGIN SELECT RAISE(ABORT, 'Evidence originals are append-only'); END;
    CREATE TRIGGER evidence_file_contents_no_delete BEFORE DELETE ON evidence_file_contents
    BEGIN SELECT RAISE(ABORT, 'Evidence originals are append-only'); END;`);
    const insert = db.prepare('INSERT OR IGNORE INTO evidence_file_contents (sha256, content) VALUES (?, ?)');
    for (const reference of evidenceFileReferences(db)) {
      const path = join(dirname(db.name), 'evidence-files', `${reference.sha256}.bin`);
      let descriptor: number | undefined;
      try {
        descriptor = openSync(path, 'r');
        const stat = fstatSync(descriptor);
        if (!stat.isFile() || stat.size !== reference.sizeBytes) {
          throw new Error('Evidence file size does not match the custody record');
        }
        const bytes = readFileSync(descriptor);
        verifyEvidenceFileContent(bytes, reference.sha256, reference.sizeBytes);
        insert.run(reference.sha256, bytes);
      } catch (error) {
        throw new Error(
          `Could not migrate evidence original ${reference.sha256}. Restore the original evidence-files directory beside saika.db and retry: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      } finally {
        if (descriptor !== undefined) closeSync(descriptor);
      }
    }
  },
};
