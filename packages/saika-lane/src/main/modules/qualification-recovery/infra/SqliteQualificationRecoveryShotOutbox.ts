// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

import type { IQualificationRecoveryShotEvidenceReader } from '@/main/modules/qualification-recovery/domain/IQualificationRecoveryShotEvidenceReader';
import type { IQualificationRecoveryShotOutbox } from '@/main/modules/qualification-recovery/domain/IQualificationRecoveryShotOutbox';
import {
  QualificationRecoveryShotPayloadSchema,
  type QualificationRecoveryShotPayload,
} from '@/shared/mqtt/QualificationRecovery';

interface OutboxRow {
  payload_json: string;
}

export class SqliteQualificationRecoveryShotOutbox
  implements IQualificationRecoveryShotOutbox, IQualificationRecoveryShotEvidenceReader
{
  constructor(private readonly db: Database.Database) {}

  enqueue(payload: QualificationRecoveryShotPayload): void {
    const validated = QualificationRecoveryShotPayloadSchema.parse(payload);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO qualification_recovery_shot_outbox (
           shot_id, competition_id, run_id, lane_id, payload_json, created_at, published_at
         ) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        validated.shotId,
        validated.competitionId,
        validated.runId,
        validated.laneId,
        JSON.stringify(validated),
        new Date().toISOString(),
      );
  }

  hasShot(shotId: string): boolean {
    return (
      this.db.prepare('SELECT 1 FROM qualification_recovery_shot_outbox WHERE shot_id = ?').get(shotId) !== undefined
    );
  }

  findPending(limit = 100): QualificationRecoveryShotPayload[] {
    const rows = this.db
      .prepare(
        `SELECT payload_json FROM qualification_recovery_shot_outbox
         WHERE published_at IS NULL ORDER BY created_at, rowid LIMIT ?`,
      )
      .all(limit) as OutboxRow[];
    return rows.map((row) => QualificationRecoveryShotPayloadSchema.parse(JSON.parse(row.payload_json)));
  }

  findByRunId(runId: string): QualificationRecoveryShotPayload[] {
    const rows = this.db
      .prepare(
        `SELECT payload_json FROM qualification_recovery_shot_outbox
         WHERE run_id = ? ORDER BY created_at, rowid`,
      )
      .all(runId) as OutboxRow[];
    return rows.map((row) => QualificationRecoveryShotPayloadSchema.parse(JSON.parse(row.payload_json)));
  }

  markPublished(shotId: string, publishedAt: Date): void {
    this.db
      .prepare(
        `UPDATE qualification_recovery_shot_outbox
         SET published_at = COALESCE(published_at, ?) WHERE shot_id = ?`,
      )
      .run(publishedAt.toISOString(), shotId);
  }
}
