import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migration066EvidenceFiles } from '@/main/infrastructure/database/migrations/066_evidence_files';
import { SqliteEvidenceFileRepository } from '@/main/modules/evidence-files/infra/SqliteEvidenceFileRepository';

describe('Evidence file metadata persistence', () => {
  it('preserves custody on restart, forbids destructive edits and enforces the evidence relationship', () => {
    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys = ON');
      db.exec(
        "CREATE TABLE target_examination_evidence (id TEXT PRIMARY KEY); INSERT INTO target_examination_evidence VALUES ('evidence');",
      );
      migration066EvidenceFiles.up(db);
      const repository = new SqliteEvidenceFileRepository(db);
      const file = {
        id: 'file',
        caseId: 'case',
        evidenceId: 'evidence',
        fileName: 'original.pdf',
        sha256: 'a'.repeat(64),
        sizeBytes: 10,
        importedBy: 'Jury',
        importedAt: '2026-09-07T00:00:00.000Z',
        statement: 'Original log',
      };
      repository.append(file);
      repository.append(file);
      expect(new SqliteEvidenceFileRepository(db).list('evidence')).toEqual([file]);
      expect(() => repository.append({ ...file, fileName: 'other' })).toThrow('already bound');
      expect(() => repository.append({ ...file, id: 'other', evidenceId: 'absent' })).toThrow('FOREIGN KEY');
      expect(() => db.prepare('DELETE FROM evidence_files').run()).toThrow('append-only');
      expect(() => db.prepare("UPDATE evidence_files SET snapshot_json = '{}' ").run()).toThrow('append-only');
    } finally {
      db.close();
    }
  });
});
