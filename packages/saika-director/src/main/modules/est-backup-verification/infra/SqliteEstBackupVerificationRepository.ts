import type Database from 'better-sqlite3';
import type { CreateEstBackupVerificationPayload, EstBackupVerificationRunDto } from '@/shared/ipc/contracts';
import type { IEstBackupVerificationRepository } from '../domain/IEstBackupVerificationRepository';

interface Row {
  id: string;
  event_id: string;
  result_kind: EstBackupVerificationRunDto['resultKind'];
  key_type: EstBackupVerificationRunDto['keyType'];
  source_name: string;
  source_reference: string | null;
  records_json: string;
  comparison_json: string;
  snapshot_revision: string;
  intervention_review_statement: string | null;
  verified: number;
  official_name: string;
  verified_at: string;
}

export class SqliteEstBackupVerificationRepository implements IEstBackupVerificationRepository {
  constructor(private readonly db: Database.Database) {}
  append(run: EstBackupVerificationRunDto, records: CreateEstBackupVerificationPayload['records']): void {
    this.db
      .prepare(
        `INSERT INTO est_backup_verification_runs (
      id, event_id, result_kind, key_type, source_name, source_reference, records_json, comparison_json,
      snapshot_revision, intervention_review_statement, verified, official_name, verified_at
    ) VALUES (
      @id, @eventId, @resultKind, @keyType, @sourceName, @sourceReference, @recordsJson, @comparisonJson,
      @snapshotRevision, @interventionReviewStatement, @verified, @officialName, @verifiedAt
    )`,
      )
      .run({
        ...run,
        recordsJson: JSON.stringify(records),
        comparisonJson: JSON.stringify(run.items),
        verified: Number(run.verified),
      });
  }
  findByEvent(eventId: string): EstBackupVerificationRunDto[] {
    return (
      this.db
        .prepare('SELECT * FROM est_backup_verification_runs WHERE event_id = ? ORDER BY rowid')
        .all(eventId) as Row[]
    ).map((row) => ({
      id: row.id,
      eventId: row.event_id,
      resultKind: row.result_kind,
      keyType: row.key_type,
      sourceName: row.source_name,
      sourceReference: row.source_reference,
      items: JSON.parse(row.comparison_json) as EstBackupVerificationRunDto['items'],
      snapshotRevision: row.snapshot_revision,
      interventionReviewStatement: row.intervention_review_statement,
      verified: row.verified === 1,
      officialName: row.official_name,
      verifiedAt: row.verified_at,
    }));
  }
}
