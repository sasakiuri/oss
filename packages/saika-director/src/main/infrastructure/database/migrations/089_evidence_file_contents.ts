import { closeSync, fstatSync, openSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { evidenceFileReferences, verifyEvidenceFileContent } from '../EvidenceFileContents';

import type { Migration } from './Migration';

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
