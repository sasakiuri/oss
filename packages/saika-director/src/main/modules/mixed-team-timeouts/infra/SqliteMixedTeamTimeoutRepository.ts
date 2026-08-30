import type Database from 'better-sqlite3';
import type {
  IMixedTeamTimeoutRepository,
  MixedTeamTimeoutEntryRecord,
  MixedTeamTimeoutRecord,
} from '../domain/IMixedTeamTimeoutRepository';

interface SessionRow {
  id: string;
  competition_id: string;
  requesting_team_id: string;
  courtesy_team_ids_json: string;
  requested_by_role: 'COACH' | 'ATHLETE';
  requested_by_name: string;
  after_shot: number;
  duration_seconds: 30;
  official_name: string;
  statement: string;
  started_at: string;
  expires_at: string;
}
interface EntryRow {
  id: string;
  timeout_id: string;
  entry_type: 'CLOSED' | 'VOID';
  official_name: string;
  statement: string;
  recorded_at: string;
}

export class SqliteMixedTeamTimeoutRepository implements IMixedTeamTimeoutRepository {
  constructor(private readonly db: Database.Database) {}
  appendSession(session: Omit<MixedTeamTimeoutRecord, 'entries'>): void {
    this.db
      .prepare(
        `INSERT INTO mixed_team_timeout_sessions (
      id, competition_id, requesting_team_id, courtesy_team_ids_json, requested_by_role,
      requested_by_name, after_shot, duration_seconds, official_name, statement, started_at, expires_at
    ) VALUES (
      @id, @competitionId, @requestingTeamId, @courtesyTeamIdsJson, @requestedByRole,
      @requestedByName, @afterShot, @durationSeconds, @officialName, @statement, @startedAt, @expiresAt
    )`,
      )
      .run({ ...session, courtesyTeamIdsJson: JSON.stringify(session.courtesyTeamIds) });
  }
  appendEntry(entry: MixedTeamTimeoutEntryRecord): void {
    this.db
      .prepare(
        `INSERT INTO mixed_team_timeout_entries (
      id, timeout_id, entry_type, official_name, statement, recorded_at
    ) VALUES (@id, @timeoutId, @entryType, @officialName, @statement, @recordedAt)`,
      )
      .run(entry);
  }
  findByCompetition(competitionId: string): MixedTeamTimeoutRecord[] {
    return this.hydrate(
      this.db
        .prepare('SELECT * FROM mixed_team_timeout_sessions WHERE competition_id = ? ORDER BY started_at, rowid')
        .all(competitionId) as SessionRow[],
    );
  }
  findById(id: string): MixedTeamTimeoutRecord | null {
    const row = this.db.prepare('SELECT * FROM mixed_team_timeout_sessions WHERE id = ?').get(id) as
      SessionRow | undefined;
    return row ? this.hydrate([row])[0]! : null;
  }
  private hydrate(rows: SessionRow[]): MixedTeamTimeoutRecord[] {
    if (rows.length === 0) return [];
    const entries = this.db
      .prepare(
        `SELECT * FROM mixed_team_timeout_entries WHERE timeout_id IN (${rows.map(() => '?').join(', ')}) ORDER BY recorded_at, rowid`,
      )
      .all(...rows.map((row) => row.id)) as EntryRow[];
    return rows.map((row) => ({
      id: row.id,
      competitionId: row.competition_id,
      requestingTeamId: row.requesting_team_id,
      courtesyTeamIds: JSON.parse(row.courtesy_team_ids_json) as string[],
      requestedByRole: row.requested_by_role,
      requestedByName: row.requested_by_name,
      afterShot: row.after_shot,
      durationSeconds: row.duration_seconds,
      officialName: row.official_name,
      statement: row.statement,
      startedAt: row.started_at,
      expiresAt: row.expires_at,
      entries: entries
        .filter((entry) => entry.timeout_id === row.id)
        .map((entry) => ({
          id: entry.id,
          timeoutId: entry.timeout_id,
          entryType: entry.entry_type,
          officialName: entry.official_name,
          statement: entry.statement,
          recordedAt: entry.recorded_at,
        })),
    }));
  }
}
