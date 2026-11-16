// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

import type { EventSummary, IEventSummaryReader } from '../domain/IEventSummaryReader';

export class SqliteEventSummaryReader implements IEventSummaryReader {
  constructor(private readonly db: Database.Database) {}

  findSummary(eventId: string): EventSummary | undefined {
    const row = this.db.prepare('SELECT name, event_type FROM events WHERE id = ?').get(eventId) as
      { name: string; event_type: string } | undefined;
    return row ? { name: row.name, eventType: row.event_type } : undefined;
  }
}
