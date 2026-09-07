import type Database from 'better-sqlite3';

import type { IRelayStartSettingsRepository, RelayStartSettings } from '../domain/IRelayStartSettingsRepository';

export class SqliteRelayStartSettingsRepository implements IRelayStartSettingsRepository {
  constructor(private readonly db: Database.Database) {}
  find(competitionId: string): RelayStartSettings | null {
    return (
      (this.db
        .prepare(
          'SELECT competition_id AS competitionId, relay_number AS relayNumber, mode FROM relay_readiness_start_settings WHERE competition_id = ?',
        )
        .get(competitionId) as RelayStartSettings | undefined) ?? null
    );
  }
  save(settings: RelayStartSettings): void {
    this.db
      .prepare(
        `INSERT INTO relay_readiness_start_settings (competition_id, relay_number, mode) VALUES (@competitionId, @relayNumber, @mode)
      ON CONFLICT(competition_id) DO UPDATE SET relay_number = excluded.relay_number, mode = excluded.mode`,
      )
      .run(settings);
  }
}
