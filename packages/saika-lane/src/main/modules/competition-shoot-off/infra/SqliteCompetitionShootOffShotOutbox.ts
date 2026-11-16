// SPDX-License-Identifier: MIT
import {
  CompetitionShootOffShotPayloadSchema,
  type CompetitionShootOffShotPayload,
} from '@sasakiuri/saika-protocol/CompetitionShootOffShot';
import type Database from 'better-sqlite3';

import type { ICompetitionShootOffShotOutbox } from '@/main/modules/competition-shoot-off/domain/ICompetitionShootOffShotOutbox';
import { SqliteOutboxTable } from '@/main/shared-infra/sqlite/SqliteOutboxTable';

interface OutboxRow {
  payload_json: string;
}

export class SqliteCompetitionShootOffShotOutbox implements ICompetitionShootOffShotOutbox {
  private readonly table: SqliteOutboxTable;

  constructor(private readonly db: Database.Database) {
    this.table = new SqliteOutboxTable(db, { name: 'competition_shoot_off_shot_outbox', key: 'shot_id' });
  }

  enqueue(payload: CompetitionShootOffShotPayload): void {
    const validated = CompetitionShootOffShotPayloadSchema.parse(payload);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO competition_shoot_off_shot_outbox (
          shot_id, competition_id, run_id, iteration, lane_id, payload_json, created_at, published_at
        ) VALUES (@shotId, @competitionId, @runId, @iteration, @laneId, @payloadJson, @createdAt, NULL)`,
      )
      .run({
        ...validated,
        payloadJson: JSON.stringify(validated),
        createdAt: new Date().toISOString(),
      });
  }

  findByRound(runId: string, iteration: number, laneId: string): CompetitionShootOffShotPayload[] {
    const rows = this.db
      .prepare(
        `SELECT payload_json FROM competition_shoot_off_shot_outbox
         WHERE run_id = ? AND iteration = ? AND lane_id = ?
         ORDER BY created_at, rowid`,
      )
      .all(runId, iteration, laneId) as OutboxRow[];
    return rows.map((row) => CompetitionShootOffShotPayloadSchema.parse(JSON.parse(row.payload_json)));
  }

  findPending(limit = 100): CompetitionShootOffShotPayload[] {
    return this.table
      .pendingPayloads(limit)
      .map((json) => CompetitionShootOffShotPayloadSchema.parse(JSON.parse(json)));
  }

  markPublished(shotId: string, publishedAt: Date): void {
    this.table.markPublished(shotId, publishedAt);
  }
}
