// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

type OutboxTable =
  | { name: 'competition_shoot_off_shot_outbox'; key: 'shot_id' }
  | { name: 'qualification_recovery_shot_outbox'; key: 'shot_id' }
  | { name: 'shot_observation_evidence_outbox'; key: 'evidence_id' };

interface PayloadRow {
  payload_json: string;
}

/** Pending reads and publication marks shared by the SQLite outbox tables; each table keeps its own columns. */
export class SqliteOutboxTable {
  constructor(
    private readonly db: Database.Database,
    private readonly table: OutboxTable,
  ) {}

  /** Unpublished payloads in the order they were enqueued. */
  pendingPayloads(limit: number): string[] {
    const rows = this.db
      .prepare(
        `SELECT payload_json FROM ${this.table.name}
         WHERE published_at IS NULL ORDER BY created_at, rowid LIMIT ?`,
      )
      .all(limit) as PayloadRow[];
    return rows.map((row) => row.payload_json);
  }

  /** Records the first publication time; later marks leave it unchanged. */
  markPublished(key: string, publishedAt: Date): void {
    this.db
      .prepare(
        `UPDATE ${this.table.name}
         SET published_at = COALESCE(published_at, ?) WHERE ${this.table.key} = ?`,
      )
      .run(publishedAt.toISOString(), key);
  }
}
