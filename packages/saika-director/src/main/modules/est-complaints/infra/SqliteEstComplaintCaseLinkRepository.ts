import type Database from 'better-sqlite3';

import {
  estComplaintSnapshotHash,
  serializeEstComplaintSnapshot,
  type SerializedEstComplaintSignalSnapshot,
} from '../domain/EstComplaintSnapshot';
import type { EstComplaintCaseLink, IEstComplaintCaseLinkRepository } from '../domain/IEstComplaintCaseLinkRepository';
import type { EstComplaintSignalSnapshot } from '../domain/IEstComplaintSignalSource';

interface LinkRow {
  signal_id: string;
  target_examination_case_id: string;
  snapshot_json: string;
  snapshot_sha256: string;
  linked_by: string;
  linked_at: string;
}

export class SqliteEstComplaintCaseLinkRepository implements IEstComplaintCaseLinkRepository {
  constructor(private readonly db: Database.Database) {}

  executeInTransaction<T>(operation: () => T): T {
    return this.db.transaction(operation)();
  }

  append(link: EstComplaintCaseLink): void {
    if (estComplaintSnapshotHash(link.snapshot) !== link.snapshotSha256) {
      throw new Error('Lane EST complaint snapshot hash does not match its immutable evidence');
    }
    this.db
      .prepare(
        `INSERT INTO est_complaint_target_examination_links (
          signal_id, target_examination_case_id, snapshot_json, snapshot_sha256, linked_by, linked_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        link.signalId,
        link.targetExaminationCaseId,
        JSON.stringify(serializeEstComplaintSnapshot(link.snapshot)),
        link.snapshotSha256,
        link.linkedBy,
        link.linkedAt.toISOString(),
      );
  }

  findBySignalId(signalId: string): EstComplaintCaseLink | null {
    const row = this.db
      .prepare('SELECT * FROM est_complaint_target_examination_links WHERE signal_id = ?')
      .get(signalId) as LinkRow | undefined;
    return row ? toLink(row) : null;
  }

  findByCompetitionId(competitionId: string): EstComplaintCaseLink[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM est_complaint_target_examination_links
         WHERE json_extract(snapshot_json, '$.context.competitionId') = ?
         ORDER BY linked_at, rowid`,
      )
      .all(competitionId) as LinkRow[];
    return rows.map(toLink);
  }
}

function toLink(row: LinkRow): EstComplaintCaseLink {
  const serialized = JSON.parse(row.snapshot_json) as SerializedEstComplaintSignalSnapshot;
  const snapshot: EstComplaintSignalSnapshot = {
    ...serialized,
    context: structuredClone(serialized.context),
    signalledAt: new Date(serialized.signalledAt),
  };
  if (estComplaintSnapshotHash(snapshot) !== row.snapshot_sha256) {
    throw new Error(`Lane EST complaint snapshot ${row.signal_id} failed integrity verification`);
  }
  return {
    signalId: row.signal_id,
    targetExaminationCaseId: row.target_examination_case_id,
    snapshot,
    snapshotSha256: row.snapshot_sha256,
    linkedBy: row.linked_by,
    linkedAt: new Date(row.linked_at),
  };
}
