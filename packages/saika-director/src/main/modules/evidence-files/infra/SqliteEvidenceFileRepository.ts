import type Database from 'better-sqlite3';
import type { EvidenceFile, IEvidenceFileRepository } from '../domain/EvidenceFile';

export class SqliteEvidenceFileRepository implements IEvidenceFileRepository {
  constructor(private readonly db: Database.Database) {}
  find(id: string): EvidenceFile | null {
    const row = this.db.prepare('SELECT snapshot_json FROM evidence_files WHERE id = ?').get(id) as
      { snapshot_json: string } | undefined;
    return row ? (JSON.parse(row.snapshot_json) as EvidenceFile) : null;
  }
  list(evidenceId: string): EvidenceFile[] {
    const rows = this.db
      .prepare('SELECT snapshot_json FROM evidence_files WHERE evidence_id = ? ORDER BY rowid')
      .all(evidenceId) as { snapshot_json: string }[];
    return rows.map((row) => JSON.parse(row.snapshot_json) as EvidenceFile);
  }
  append(file: EvidenceFile): void {
    const existing = this.find(file.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(file))
        throw new Error('Evidence file import ID is already bound');
      return;
    }
    this.db
      .prepare('INSERT INTO evidence_files (id, evidence_id, snapshot_json) VALUES (?, ?, ?)')
      .run(file.id, file.evidenceId, JSON.stringify(file));
  }
}
