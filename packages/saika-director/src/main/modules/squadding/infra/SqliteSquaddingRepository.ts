import type Database from 'better-sqlite3';
import type { SquaddingAssignmentDto, SquaddingFindingDto } from '@/shared/ipc/contracts';
import type {
  ISquaddingRepository,
  SquaddingDrawEntryRecord,
  SquaddingDrawEntryType,
  SquaddingDrawRecord,
  SquaddingStatusSectionPolicy,
} from '../domain/ISquaddingRepository';

interface DrawRow {
  id: string;
  event_id: string;
  competition_type_id: string;
  seed: string;
  algorithm_version: string;
  relay_count: number;
  first_firing_point: number;
  firing_point_count: number;
  status_section_policy: SquaddingStatusSectionPolicy;
  participant_snapshot_json: string;
  participant_snapshot_hash: string;
  assignments_json: string;
  output_hash: string;
  findings_json: string;
  created_by: string;
  created_at: string;
}

interface EntryRow {
  id: string;
  draw_id: string;
  entry_type: SquaddingDrawEntryType;
  official_name: string;
  statement: string;
  recorded_at: string;
}

export class SqliteSquaddingRepository implements ISquaddingRepository {
  constructor(private readonly db: Database.Database) {}

  appendDraw(draw: Omit<SquaddingDrawRecord, 'entries'>): void {
    this.db
      .prepare(
        `INSERT INTO squadding_draws (
      id, event_id, competition_type_id, seed, algorithm_version, relay_count,
      first_firing_point, firing_point_count, status_section_policy,
      participant_snapshot_json, participant_snapshot_hash, assignments_json,
      output_hash, findings_json, created_by, created_at
    ) VALUES (
      @id, @eventId, @competitionTypeId, @seed, @algorithmVersion, @relayCount,
      @firstFiringPoint, @firingPointCount, @statusSectionPolicy,
      @participantSnapshotJson, @participantSnapshotHash, @assignmentsJson,
      @outputHash, @findingsJson, @createdBy, @createdAt
    )`,
      )
      .run({
        ...draw,
        assignmentsJson: JSON.stringify(draw.assignments),
        findingsJson: JSON.stringify(draw.findings),
      });
  }

  appendEntry(entry: SquaddingDrawEntryRecord): void {
    this.db
      .prepare(
        `INSERT INTO squadding_draw_entries (
      id, draw_id, entry_type, official_name, statement, recorded_at
    ) VALUES (@id, @drawId, @entryType, @officialName, @statement, @recordedAt)`,
      )
      .run(entry);
  }

  findByEvent(eventId: string): SquaddingDrawRecord[] {
    return this.hydrate(
      this.db
        .prepare('SELECT * FROM squadding_draws WHERE event_id = ? ORDER BY created_at DESC, rowid DESC')
        .all(eventId) as DrawRow[],
    );
  }

  findById(id: string): SquaddingDrawRecord | null {
    const row = this.db.prepare('SELECT * FROM squadding_draws WHERE id = ?').get(id) as DrawRow | undefined;
    return row ? this.hydrate([row])[0]! : null;
  }

  private hydrate(rows: DrawRow[]): SquaddingDrawRecord[] {
    if (rows.length === 0) return [];
    const entries = this.db
      .prepare(
        `SELECT * FROM squadding_draw_entries WHERE draw_id IN (${rows.map(() => '?').join(', ')})
       ORDER BY recorded_at, rowid`,
      )
      .all(...rows.map((row) => row.id)) as EntryRow[];
    return rows.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      competitionTypeId: row.competition_type_id,
      seed: row.seed,
      algorithmVersion: row.algorithm_version,
      relayCount: row.relay_count,
      firstFiringPoint: row.first_firing_point,
      firingPointCount: row.firing_point_count,
      statusSectionPolicy: row.status_section_policy,
      participantSnapshotJson: row.participant_snapshot_json,
      participantSnapshotHash: row.participant_snapshot_hash,
      assignments: JSON.parse(row.assignments_json) as SquaddingAssignmentDto[],
      outputHash: row.output_hash,
      findings: JSON.parse(row.findings_json) as SquaddingFindingDto[],
      createdBy: row.created_by,
      createdAt: row.created_at,
      entries: entries
        .filter((entry) => entry.draw_id === row.id)
        .map((entry) => ({
          id: entry.id,
          drawId: entry.draw_id,
          entryType: entry.entry_type,
          officialName: entry.official_name,
          statement: entry.statement,
          recordedAt: entry.recorded_at,
        })),
    }));
  }
}
