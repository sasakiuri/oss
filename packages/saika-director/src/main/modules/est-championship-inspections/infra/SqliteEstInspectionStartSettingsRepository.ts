import type Database from 'better-sqlite3';

import type {
  EstInspectionStartSettings,
  IEstInspectionStartSettingsRepository,
} from '../domain/IEstInspectionStartSettingsRepository';

export class SqliteEstInspectionStartSettingsRepository implements IEstInspectionStartSettingsRepository {
  constructor(private readonly db: Database.Database) {}
  find(competitionId: string): EstInspectionStartSettings | null {
    const row = this.db
      .prepare('SELECT settings_json FROM est_inspection_start_settings WHERE competition_id = ?')
      .get(competitionId) as { settings_json: string } | undefined;
    return row ? (JSON.parse(row.settings_json) as EstInspectionStartSettings) : null;
  }
  save(settings: EstInspectionStartSettings): void {
    this.db
      .prepare(
        `INSERT INTO est_inspection_start_settings (competition_id, settings_json) VALUES (?, ?)
      ON CONFLICT(competition_id) DO UPDATE SET settings_json = excluded.settings_json`,
      )
      .run(settings.competitionId, JSON.stringify(settings));
  }
}
