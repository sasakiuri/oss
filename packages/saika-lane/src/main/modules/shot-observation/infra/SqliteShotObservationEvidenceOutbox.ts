// SPDX-License-Identifier: MIT

import type Database from 'better-sqlite3';

import { SqliteOutboxTable } from '@/main/shared-infra/sqlite/SqliteOutboxTable';

import type { IShotObservationEvidenceOutbox } from '../domain/IShotObservationEvidenceOutbox';
import { parseShotObservationEvidence, type ShotObservationEvidence } from '../domain/ShotObservationEvidence';

export class SqliteShotObservationEvidenceOutbox implements IShotObservationEvidenceOutbox {
  private readonly table: SqliteOutboxTable;

  constructor(db: Database.Database) {
    this.table = new SqliteOutboxTable(db, { name: 'shot_observation_evidence_outbox', key: 'evidence_id' });
  }

  async findPending(limit = 100): Promise<readonly ShotObservationEvidence[]> {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer');
    return this.table.pendingPayloads(limit).map((json) => parseShotObservationEvidence(json));
  }

  async markPublished(evidenceId: string, publishedAt: Date): Promise<void> {
    if (!Number.isFinite(publishedAt.getTime())) throw new Error('publishedAt must be valid');
    this.table.markPublished(evidenceId, publishedAt);
  }
}
