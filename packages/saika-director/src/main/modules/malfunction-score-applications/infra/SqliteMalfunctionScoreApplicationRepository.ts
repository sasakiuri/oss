import type Database from 'better-sqlite3';
import type {
  IMalfunctionScoreApplicationRepository,
  MalfunctionScoreApplication,
  MalfunctionScoreWithdrawal,
} from '../domain/MalfunctionScoreApplication';

export class SqliteMalfunctionScoreApplicationRepository implements IMalfunctionScoreApplicationRepository {
  constructor(private readonly db: Database.Database) {}
  find(id: string): MalfunctionScoreApplication | null {
    const row = this.db.prepare('SELECT snapshot_json FROM malfunction_score_applications WHERE id = ?').get(id);
    return row ? parse<MalfunctionScoreApplication>(row) : null;
  }
  list(caseId: string) {
    return this.db
      .prepare('SELECT snapshot_json FROM malfunction_score_applications WHERE case_id = ? ORDER BY rowid')
      .all(caseId)
      .map((row) => parse<MalfunctionScoreApplication>(row));
  }
  byTarget(eventId: string, participantId: string, relayNumber: number) {
    return this.db
      .prepare(
        `SELECT snapshot_json FROM malfunction_score_applications
      WHERE event_id = ? AND participant_id = ? AND relay_number = ? ORDER BY rowid`,
      )
      .all(eventId, participantId, relayNumber)
      .map((row) => parse<MalfunctionScoreApplication>(row));
  }
  append(value: MalfunctionScoreApplication) {
    this.db
      .prepare(
        `INSERT INTO malfunction_score_applications
      (id, case_id, event_id, participant_id, relay_number, snapshot_json) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(value.id, value.caseId, value.eventId, value.participantId, value.relayNumber, JSON.stringify(value));
  }
  withdrawal(applicationId: string): MalfunctionScoreWithdrawal | null {
    const row = this.db
      .prepare('SELECT snapshot_json FROM malfunction_score_withdrawals WHERE application_id = ?')
      .get(applicationId);
    return row ? parse<MalfunctionScoreWithdrawal>(row) : null;
  }
  withdraw(value: MalfunctionScoreWithdrawal) {
    this.db
      .prepare('INSERT INTO malfunction_score_withdrawals (id, application_id, snapshot_json) VALUES (?, ?, ?)')
      .run(value.id, value.applicationId, JSON.stringify(value));
  }
}
function parse<T>(row: unknown): T {
  return JSON.parse((row as { snapshot_json: string }).snapshot_json) as T;
}
