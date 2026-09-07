import type Database from 'better-sqlite3';

import type { IMalfunctionScoreSheetRepository } from '../application/MalfunctionScoreSheetPorts';
import type { MalfunctionScoreSheet } from '../domain/MalfunctionScoreSheet';

export class SqliteMalfunctionScoreSheetRepository implements IMalfunctionScoreSheetRepository {
  constructor(private readonly db: Database.Database) {}
  find(id: string): MalfunctionScoreSheet | null {
    const row = this.db
      .prepare('SELECT content_json FROM qualification_malfunction_score_sheets WHERE id = ?')
      .get(id) as { content_json: string } | undefined;
    return row ? (JSON.parse(row.content_json) as MalfunctionScoreSheet) : null;
  }
  list(caseId: string): MalfunctionScoreSheet[] {
    const rows = this.db
      .prepare('SELECT content_json FROM qualification_malfunction_score_sheets WHERE case_id = ? ORDER BY version')
      .all(caseId) as { content_json: string }[];
    return rows.map((row) => JSON.parse(row.content_json) as MalfunctionScoreSheet);
  }
  append(value: MalfunctionScoreSheet): void {
    this.db
      .prepare(
        `INSERT INTO qualification_malfunction_score_sheets (id, case_id, version, content_json, digest, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(value.id, value.input.caseId, value.version, JSON.stringify(value), value.digest, value.recordedAt);
  }
}
