import type Database from 'better-sqlite3';

/** Resolves stored result/run associations; the protest workflow does not depend on their owners. */
export class SqliteProtestEventScope {
  constructor(private readonly db: Database.Database) {}

  competitionIds(eventId: string, resultScope: 'QUALIFICATION' | 'FINAL'): string[] {
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
