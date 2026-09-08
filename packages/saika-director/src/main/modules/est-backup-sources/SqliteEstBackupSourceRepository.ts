import type Database from 'better-sqlite3';

import type {
  EstBackupSourceDto,
  EstBackupSourceSummaryDto,
} from '@/shared/ipc/contracts/estBackupVerification.contract';

import type { IEstBackupSourceRepository } from './EstBackupSourceService';

export class SqliteEstBackupSourceRepository implements IEstBackupSourceRepository {
  constructor(private readonly db: Database.Database) {}
  append(source: EstBackupSourceDto): void {
    this.db
      .prepare('INSERT INTO est_backup_sources (id, event_id, payload_json) VALUES (?, ?, ?)')
      .run(source.id, source.eventId, JSON.stringify(source));
  }
  find(id: string): EstBackupSourceDto | null {
    const row = this.db.prepare('SELECT payload_json FROM est_backup_sources WHERE id = ?').get(id) as
      { payload_json: string } | undefined;
    return row ? (JSON.parse(row.payload_json) as EstBackupSourceDto) : null;
  }
  list(eventId: string): EstBackupSourceSummaryDto[] {
    const rows = this.db
      .prepare(
        "SELECT json_remove(payload_json, '$.content', '$.records') AS summary FROM est_backup_sources WHERE event_id = ? ORDER BY rowid DESC",
      )
      .all(eventId) as { summary: string }[];
    return rows.map((row) => JSON.parse(row.summary) as EstBackupSourceSummaryDto);
  }
}
