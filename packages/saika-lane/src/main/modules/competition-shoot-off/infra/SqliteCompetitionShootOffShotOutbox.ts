// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

import type { ICompetitionShootOffShotOutbox } from '@/main/modules/competition-shoot-off/domain/ICompetitionShootOffShotOutbox';
import {
  CompetitionShootOffShotPayloadSchema,
  type CompetitionShootOffShotPayload,
} from '@/shared/mqtt/CompetitionShootOffShot';

interface OutboxRow {
  payload_json: string;
}

export class SqliteCompetitionShootOffShotOutbox implements ICompetitionShootOffShotOutbox {
  constructor(private readonly db: Database.Database) {}

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

  findByRound(runId: string, iteration: number, laneId: string): CompetitionShootOffShotPayload | null {
    const row = this.db
      .prepare(
        `SELECT payload_json FROM competition_shoot_off_shot_outbox
         WHERE run_id = ? AND iteration = ? AND lane_id = ?`,
      )
      .get(runId, iteration, laneId) as OutboxRow | undefined;
    return row ? CompetitionShootOffShotPayloadSchema.parse(JSON.parse(row.payload_json)) : null;
  }

  findPending(limit = 100): CompetitionShootOffShotPayload[] {
    const rows = this.db
      .prepare(
        `SELECT payload_json FROM competition_shoot_off_shot_outbox
         WHERE published_at IS NULL ORDER BY created_at, rowid LIMIT ?`,
      )
      .all(limit) as OutboxRow[];
    return rows.map((row) => CompetitionShootOffShotPayloadSchema.parse(JSON.parse(row.payload_json)));
  }

  markPublished(shotId: string, publishedAt: Date): void {
    this.db
      .prepare(
        `UPDATE competition_shoot_off_shot_outbox
         SET published_at = COALESCE(published_at, ?) WHERE shot_id = ?`,
      )
      .run(publishedAt.toISOString(), shotId);
  }
}
