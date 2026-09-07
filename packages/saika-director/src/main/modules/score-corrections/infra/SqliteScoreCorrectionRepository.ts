// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

import type {
  IScoreCorrectionRepository,
  ScoreCorrectionApplication,
  ScoreCorrectionWithdrawal,
} from '../domain/ScoreCorrection';

export class SqliteScoreCorrectionRepository implements IScoreCorrectionRepository {
  constructor(private readonly db: Database.Database) {}
  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation)();
  }
  find(id: string) {
    return parse<ScoreCorrectionApplication>(
      this.db.prepare('SELECT snapshot_json FROM score_corrections WHERE id = ?').get(id),
    );
  }
  list(target: Parameters<IScoreCorrectionRepository['list']>[0]) {
    return this.db
      .prepare(
        'SELECT snapshot_json FROM score_corrections WHERE event_id = ? AND participant_id = ? AND relay_number = ? AND result_scope = ? ORDER BY rowid',
      )
      .all(target.eventId, target.participantId, target.relayNumber, target.resultScope)
      .map((row) => parse<ScoreCorrectionApplication>(row)!);
  }
  append(value: ScoreCorrectionApplication) {
    const basis = value.basis;
    this.db
      .prepare(
        'INSERT INTO score_corrections (id, event_id, participant_id, relay_number, result_scope, snapshot_json) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(value.id, basis.eventId, basis.participantId, basis.relayNumber, basis.resultScope, JSON.stringify(value));
  }
  withdrawal(applicationId: string) {
    return parse<ScoreCorrectionWithdrawal>(
      this.db
        .prepare('SELECT snapshot_json FROM score_correction_withdrawals WHERE application_id = ?')
        .get(applicationId),
    );
  }
  withdraw(value: ScoreCorrectionWithdrawal) {
    this.db
      .prepare('INSERT INTO score_correction_withdrawals (id, application_id, snapshot_json) VALUES (?, ?, ?)')
      .run(value.id, value.applicationId, JSON.stringify(value));
  }
}
function parse<T>(row: unknown): T | null {
  return row ? (JSON.parse((row as { snapshot_json: string }).snapshot_json) as T) : null;
}
