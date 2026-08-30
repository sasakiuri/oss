// SPDX-License-Identifier: MIT

import type Database from 'better-sqlite3';

import type { IShotObservationEvidenceOutbox } from '../domain/IShotObservationEvidenceOutbox';
import { parseShotObservationEvidence, type ShotObservationEvidence } from '../domain/ShotObservationEvidence';

interface EvidenceRow {
  payload_json: string;
}

export class SqliteShotObservationEvidenceOutbox implements IShotObservationEvidenceOutbox {
  constructor(private readonly db: Database.Database) {}

  async findPending(limit = 100): Promise<readonly ShotObservationEvidence[]> {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer');
    const rows = this.db
      .prepare(
        `SELECT payload_json FROM shot_observation_evidence_outbox
         WHERE published_at IS NULL
         ORDER BY created_at, rowid
         LIMIT ?`,
      )
      .all(limit) as EvidenceRow[];
    return rows.map((row) => parseShotObservationEvidence(row.payload_json));
  }

  async markPublished(evidenceId: string, publishedAt: Date): Promise<void> {
    if (!Number.isFinite(publishedAt.getTime())) throw new Error('publishedAt must be valid');
    this.db
      .prepare(
        `UPDATE shot_observation_evidence_outbox
         SET published_at = COALESCE(published_at, ?)
         WHERE evidence_id = ?`,
      )
      .run(publishedAt.toISOString(), evidenceId);
  }
}
