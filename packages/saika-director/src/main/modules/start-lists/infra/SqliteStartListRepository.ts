import type Database from 'better-sqlite3';

import type {
  IStartListRepository,
  StartListEntryRecord,
  StartListEntryType,
  StartListSnapshot,
  StartListVersionRecord,
} from '../domain/IStartListRepository';
import type {
  StartListDisciplineGroupDto,
  StartListDistributionChannelDto,
  StartListDistributionModeDto,
  StartListFinalReleaseBasisDto,
  StartListFindingDto,
  StartListKindDto,
  StartListOfficialRoleDto,
} from '@/shared/ipc/contracts';

interface VersionRow {
  id: string;
  event_id: string;
  version_number: number;
  list_kind: StartListKindDto;
  discipline_group: StartListDisciplineGroupDto;
  distribution_mode: StartListDistributionModeDto;
  scheduled_start_at: string;
  publication_due_at: string;
  source_snapshot_json: string;
  source_hash: string;
  findings_json: string;
  created_by: string;
  created_at: string;
}

interface EntryRow {
  id: string;
  version_id: string;
  entry_type: StartListEntryType;
  official_name: string;
  official_role: StartListOfficialRoleDto;
  statement: string;
  channels_json: string;
  final_release_basis: StartListFinalReleaseBasisDto | null;
  recorded_at: string;
}

export class SqliteStartListRepository implements IStartListRepository {
  constructor(private readonly db: Database.Database) {}

  appendVersion(value: Omit<StartListVersionRecord, 'entries'>): void {
    this.db
      .prepare(
        `INSERT INTO start_list_versions (
          id, event_id, version_number, list_kind, discipline_group, distribution_mode,
          scheduled_start_at, publication_due_at, source_snapshot_json, source_hash,
          findings_json, created_by, created_at
        ) VALUES (
          @id, @eventId, @versionNumber, @listKind, @disciplineGroup, @distributionMode,
          @scheduledStartAt, @publicationDueAt, @sourceSnapshotJson, @sourceHash,
          @findingsJson, @createdBy, @createdAt
        )`,
      )
      .run({ ...value, findingsJson: JSON.stringify(value.findings) });
  }

  appendEntry(value: StartListEntryRecord): void {
    this.db
      .prepare(
        `INSERT INTO start_list_entries (
          id, version_id, entry_type, official_name, official_role, statement,
          channels_json, final_release_basis, recorded_at
        ) VALUES (
          @id, @versionId, @type, @officialName, @officialRole, @statement,
          @channelsJson, @finalReleaseBasis, @recordedAt
        )`,
      )
      .run({ ...value, channelsJson: JSON.stringify(value.channels) });
  }

  findByEvent(eventId: string): StartListVersionRecord[] {
    return this.hydrate(
      this.db
        .prepare(
          'SELECT * FROM start_list_versions WHERE event_id = ? ORDER BY list_kind, version_number DESC, rowid DESC',
        )
        .all(eventId) as VersionRow[],
    );
  }

  findById(id: string): StartListVersionRecord | null {
    const row = this.db.prepare('SELECT * FROM start_list_versions WHERE id = ?').get(id) as VersionRow | undefined;
    return row ? this.hydrate([row])[0]! : null;
  }

  nextVersionNumber(eventId: string, listKind: StartListKindDto): number {
    const row = this.db
      .prepare(
        'SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM start_list_versions WHERE event_id = ? AND list_kind = ?',
      )
      .get(eventId, listKind) as { next: number };
    return row.next;
  }

  private hydrate(rows: VersionRow[]): StartListVersionRecord[] {
    if (rows.length === 0) return [];
    const entryRows = this.db
      .prepare(
        `SELECT * FROM start_list_entries WHERE version_id IN (${rows.map(() => '?').join(',')})
         ORDER BY recorded_at, rowid`,
      )
      .all(...rows.map((row) => row.id)) as EntryRow[];
    return rows.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      versionNumber: row.version_number,
      listKind: row.list_kind,
      disciplineGroup: row.discipline_group,
      distributionMode: row.distribution_mode,
      scheduledStartAt: row.scheduled_start_at,
      publicationDueAt: row.publication_due_at,
      sourceSnapshotJson: row.source_snapshot_json,
      sourceHash: row.source_hash,
      snapshot: JSON.parse(row.source_snapshot_json) as StartListSnapshot,
      findings: JSON.parse(row.findings_json) as StartListFindingDto[],
      createdBy: row.created_by,
      createdAt: row.created_at,
      entries: entryRows.filter((entry) => entry.version_id === row.id).map(toEntry),
    }));
  }
}

function toEntry(row: EntryRow): StartListEntryRecord {
  return {
    id: row.id,
    versionId: row.version_id,
    type: row.entry_type,
    officialName: row.official_name,
    officialRole: row.official_role,
    statement: row.statement,
    channels: JSON.parse(row.channels_json) as StartListDistributionChannelDto[],
    finalReleaseBasis: row.final_release_basis,
    recordedAt: row.recorded_at,
  };
}
