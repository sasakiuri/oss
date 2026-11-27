// SPDX-License-Identifier: MIT
import type { ResultScope } from '@/shared/ipc/contracts';
import type Database from 'better-sqlite3';

/**
 * Finds the competitions that produced an event's results: qualification results by their source
 * competition, Finals by their operation runs, control decisions and imported Mixed Team results.
 */
export class SqliteResultCompetitionScope {
  constructor(private readonly db: Database.Database) {}

  competitionIds(eventId: string, resultScope: ResultScope): string[] {
    const query =
      resultScope === 'QUALIFICATION'
        ? `SELECT DISTINCT source_competition_id AS competition_id FROM results
           WHERE event_id = @eventId AND source_competition_id IS NOT NULL`
        : `SELECT competition_id FROM final_operation_runs WHERE event_id = @eventId
           UNION SELECT competition_id FROM final_control_decisions WHERE event_id = @eventId
           UNION SELECT competition_id FROM mixed_team_final_decisions WHERE event_id = @eventId
           UNION SELECT source_competition_id AS competition_id FROM mixed_team_final_results WHERE event_id = @eventId`;
    const rows = this.db.prepare(query).all({ eventId }) as { competition_id: string }[];
    return rows.map((row) => row.competition_id);
  }
}
