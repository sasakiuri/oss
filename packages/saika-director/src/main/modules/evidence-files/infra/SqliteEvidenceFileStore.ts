import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';

import {
  DEFAULT_EVIDENCE_FILE_LIMIT,
  verifyEvidenceFileContent,
} from '@/main/infrastructure/database/EvidenceFileContents';

import type { IEvidenceFileStore } from '../domain/EvidenceFile';

/** Original bytes share the database snapshot and restore transaction with their custody records. */
export class SqliteEvidenceFileStore implements IEvidenceFileStore {
  constructor(
    private readonly database: Database.Database,
    private readonly maximumBytes = DEFAULT_EVIDENCE_FILE_LIMIT,
  ) {}

  async put(bytes: Uint8Array): Promise<{ sha256: string; sizeBytes: number }> {
    if (bytes.byteLength > this.maximumBytes) throw new Error(`Evidence file exceeds ${this.maximumBytes} bytes`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    this.database
      .prepare('INSERT OR IGNORE INTO evidence_file_contents (sha256, content) VALUES (?, ?)')
      .run(sha256, Buffer.from(bytes));
    await this.readVerified(sha256, bytes.byteLength);
    return { sha256, sizeBytes: bytes.byteLength };
  }

  async readVerified(sha256: string, sizeBytes: number): Promise<Uint8Array> {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid evidence content key');
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > this.maximumBytes) {
      throw new Error('Invalid evidence file size');
    }
    const row = this.database.prepare('SELECT content FROM evidence_file_contents WHERE sha256 = ?').get(sha256) as
      { content: Buffer } | undefined;
    if (!row || !Buffer.isBuffer(row.content)) throw new Error(`Evidence original is missing: ${sha256}`);
    verifyEvidenceFileContent(row.content, sha256, sizeBytes);
    return row.content;
  }
}
