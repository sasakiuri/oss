// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

import type {
  IVistaSourceStore,
  VistaLinkedResult,
  VistaParticipantRecord,
  VistaSourceRow,
} from '../application/VistaSourceStore';

export class SqliteVistaSourceStore implements IVistaSourceStore {
  constructor(private readonly db: Database.Database) {}

  transaction(operation: () => void): void {
    this.db.transaction(operation)();
  }

  rows(): VistaSourceRow[] {
    return this.db.prepare('SELECT * FROM vista_competition_sources ORDER BY rowid').all() as VistaSourceRow[];
  }

  row(id: string): VistaSourceRow | null {
    return (
      (this.db.prepare('SELECT * FROM vista_competition_sources WHERE id = ?').get(id) as VistaSourceRow | undefined) ??
      null
    );
  }

  saveSource(id: string, sourceJson: string): void {
    this.db.prepare('UPDATE vista_competition_sources SET source_json = ? WHERE id = ?').run(sourceJson, id);
  }

  upsertSource(id: string, sourceJson: string): void {
    this.db
      .prepare(
        `INSERT INTO vista_competition_sources (id, source_json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET source_json = excluded.source_json`,
      )
      .run(id, sourceJson);
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
