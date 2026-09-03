import type Database from 'better-sqlite3';

import type { IRangeOfficerRequestRepository } from '../domain/IRangeOfficerRequestRepository';
import { RangeOfficerRequestState, type RangeOfficerRequestCategory } from '../domain/RangeOfficerRequestState';

interface Row {
  request_id: string;
  event_type: 'REQUESTED' | 'CLEARED';
  category: RangeOfficerRequestCategory;
  message: string | null;
  requested_at: string;
  occurred_at: string;
  cleared_by: string | null;
}

export class SqliteRangeOfficerRequestRepository implements IRangeOfficerRequestRepository {
  constructor(private readonly database: Database.Database) {}

  getCurrent(): RangeOfficerRequestState | null {
    const row = this.database
      .prepare('SELECT * FROM range_officer_request_events ORDER BY recorded_at DESC, rowid DESC LIMIT 1')
      .get() as Row | undefined;
    if (!row) return null;
    return RangeOfficerRequestState.create({
      requestId: row.request_id,
      status: row.event_type === 'REQUESTED' ? 'ACTIVE' : 'CLEARED',
      category: row.category,
      message: row.message,
      requestedAt: new Date(row.requested_at),
      ...(row.event_type === 'CLEARED' ? { clearedAt: new Date(row.occurred_at), clearedBy: row.cleared_by } : {}),
    });
  }

  appendRequested(state: RangeOfficerRequestState): void {
    this.insert(state, 'REQUESTED', state.requestedAt, null);
  }

  appendCleared(state: RangeOfficerRequestState): void {
    if (!state.clearedAt || !state.clearedBy) throw new Error('Clearance evidence is incomplete');
    this.insert(state, 'CLEARED', state.clearedAt, state.clearedBy);
  }

  private insert(
    state: RangeOfficerRequestState,
    eventType: 'REQUESTED' | 'CLEARED',
    occurredAt: Date,
    clearedBy: string | null,
  ): void {
    this.database
      .prepare(
        `INSERT INTO range_officer_request_events (
          id, request_id, event_type, category, message, requested_at,
          occurred_at, cleared_by, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        state.requestId,
        eventType,
        state.category,
        state.message,
        state.requestedAt.toISOString(),
        occurredAt.toISOString(),
        clearedBy,
        new Date().toISOString(),
      );
  }
}
