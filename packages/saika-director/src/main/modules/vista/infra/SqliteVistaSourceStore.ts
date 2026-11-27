// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

import type { SavedSource } from '../application/VistaSourceModel';
import type {
  IVistaSourceStore,
  VistaLinkedResult,
  VistaParticipantRecord,
  VistaSourceRow,
} from '../application/VistaSourceStore';

type StoredSourceRow = Omit<VistaSourceRow, 'source'> & { source_json: string };

const toSourceRow = ({ source_json, ...row }: StoredSourceRow): VistaSourceRow => ({
  ...row,
  source: JSON.parse(source_json) as SavedSource,
});

export class SqliteVistaSourceStore implements IVistaSourceStore {
  constructor(private readonly db: Database.Database) {}

  transaction(operation: () => void): void {
    this.db.transaction(operation)();
  }

  rows(): VistaSourceRow[] {
    return (this.db.prepare('SELECT * FROM vista_competition_sources ORDER BY rowid').all() as StoredSourceRow[]).map(
      toSourceRow,
    );
  }

  row(id: string): VistaSourceRow | null {
    const row = this.db.prepare('SELECT * FROM vista_competition_sources WHERE id = ?').get(id) as
      StoredSourceRow | undefined;
    return row ? toSourceRow(row) : null;
  }

  saveSource(id: string, source: SavedSource): void {
    this.db
      .prepare('UPDATE vista_competition_sources SET source_json = ? WHERE id = ?')
      .run(JSON.stringify(source), id);
  }

  upsertSource(id: string, source: SavedSource): void {
    this.db
      .prepare(
        `INSERT INTO vista_competition_sources (id, source_json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET source_json = excluded.source_json`,
      )
      .run(id, JSON.stringify(source));
  }

  saveSnapshot(id: string, snapshotJson: string, revision: number): void {
    this.db
      .prepare('UPDATE vista_competition_sources SET snapshot_json = ?, revision = ? WHERE id = ?')
      .run(snapshotJson, revision, id);
  }

  participant(id: string): VistaParticipantRecord | null {
    return (
      (this.db
        .prepare('SELECT id, event_id, player_name, affiliation, entry_status FROM participants WHERE id = ?')
        .get(id) as VistaParticipantRecord | undefined) ?? null
    );
  }

  eventLabels(eventId: string): { name: string; championship: string } | undefined {
    return this.db
      .prepare(
        `SELECT e.name, c.name championship FROM events e JOIN championships c ON c.id = e.championship_id WHERE e.id = ?`,
      )
      .get(eventId) as { name: string; championship: string } | undefined;
  }

  resultRelay(eventId: string, competitionId: string): { relay_number: number } | undefined {
    return this.db
      .prepare('SELECT relay_number FROM results WHERE event_id = ? AND source_competition_id = ? LIMIT 1')
      .get(eventId, competitionId) as { relay_number: number } | undefined;
  }

  eventType(eventId: string): { event_type: string } | undefined {
    return this.db.prepare('SELECT event_type FROM events WHERE id = ?').get(eventId) as
      { event_type: string } | undefined;
  }

  resultLinks(eventId: string, final: boolean): VistaLinkedResult[] {
    if (final)
      return this.db
        .prepare(
          'SELECT id, participant_id, source_competition_id, NULL source_lane_id, 1 relay_number FROM final_results WHERE event_id = ?',
        )
        .all(eventId) as VistaLinkedResult[];
    return this.db
      .prepare(
        'SELECT id, participant_id, source_competition_id, source_lane_id, relay_number FROM results WHERE event_id = ?',
      )
      .all(eventId) as VistaLinkedResult[];
  }

  changeCount(): number {
    return (this.db.prepare('SELECT total_changes() AS count').get() as { count: number }).count;
  }

  transferRevision(): number {
    return (
      this.db
        .prepare(
          "SELECT COALESCE(MAX(rowid), 0) AS revision FROM reserve_lane_transfer_events WHERE operation = 'TARGET_ACTIVE'",
        )
        .get() as { revision: number }
    ).revision;
  }
}
