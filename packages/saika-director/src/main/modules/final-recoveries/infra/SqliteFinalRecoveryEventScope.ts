import type Database from 'better-sqlite3';

/** Finds event associations recorded by Final control, scripts, or imported mixed-team results. */
export class SqliteFinalRecoveryEventScope {
  constructor(private readonly db: Database.Database) {}
  competitionIds(eventId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT competition_id FROM final_operation_runs WHERE event_id = @eventId
      UNION SELECT competition_id FROM final_control_decisions WHERE event_id = @eventId
      UNION SELECT competition_id FROM mixed_team_final_decisions WHERE event_id = @eventId
      UNION SELECT source_competition_id AS competition_id FROM mixed_team_final_results WHERE event_id = @eventId`,
      )
      .all({ eventId }) as { competition_id: string }[];
    return rows.map((row) => row.competition_id);
  }
}
