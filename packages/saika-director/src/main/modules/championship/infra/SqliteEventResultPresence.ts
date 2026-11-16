// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

import type { IEventResultPresence } from '../application/ChampionshipService';

export class SqliteEventResultPresence implements IEventResultPresence {
  constructor(private readonly database: Database.Database) {}

  hasStoredResults(eventId: string): boolean {
    const row = this.database
      .prepare(
        `SELECT (
        EXISTS(SELECT 1 FROM results WHERE event_id = @eventId)
        OR EXISTS(SELECT 1 FROM final_results WHERE event_id = @eventId)
        OR EXISTS(SELECT 1 FROM mixed_team_final_results WHERE event_id = @eventId)
      ) AS has_results`,
      )
      .get({ eventId }) as { has_results: number };
    return row.has_results === 1;
  }
}
