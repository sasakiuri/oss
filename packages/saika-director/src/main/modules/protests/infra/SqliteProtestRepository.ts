import type Database from 'better-sqlite3';
import type { IProtestRepository } from '../domain/IProtestRepository';
import { ProtestCase, type ProtestKind, type ProtestScopeType } from '../domain/ProtestCase';
import { ProtestEntry, type ProtestEntryType } from '../domain/ProtestEntry';

interface CaseRow {
  id: string;
  scope_type: ProtestScopeType;
  scope_id: string;
  kind: ProtestKind;
  parent_protest_id: string | null;
  subject: string;
  statement: string;
  lodged_by: string;
  lodged_at: string;
  triggering_decision_at: string | null;
  form_reference: string | null;
  fee_paid_euro: number | null;
  late_acceptance_reason: string | null;
  opened_by: string;
  created_at: string;
}
interface EntryRow {
  id: string;
  case_id: string;
  entry_type: ProtestEntryType;
  statement: string;
  official_name: string;
  rule_reference: string | null;
  occurred_at: string;
  recorded_at: string;
}

export class SqliteProtestRepository implements IProtestRepository {
  constructor(private readonly db: Database.Database) {}

  appendCase(protest: ProtestCase): void {
    this.db
      .prepare(
        `INSERT INTO protest_cases (
      id, scope_type, scope_id, kind, parent_protest_id, subject, statement, lodged_by, lodged_at,
      triggering_decision_at, form_reference, fee_paid_euro, late_acceptance_reason, opened_by, created_at
    ) VALUES (
      @id, @scopeType, @scopeId, @kind, @parentProtestId, @subject, @statement, @lodgedBy, @lodgedAt,
      @triggeringDecisionAt, @formReference, @feePaidEuro, @lateAcceptanceReason, @openedBy, @createdAt
    )`,
      )
      .run({
        ...protest,
        lodgedAt: protest.lodgedAt.toISOString(),
        triggeringDecisionAt: protest.triggeringDecisionAt?.toISOString() ?? null,
        createdAt: protest.createdAt.toISOString(),
      });
  }

  appendEntry(entry: ProtestEntry): void {
    this.db
      .prepare(
        `INSERT INTO protest_entries (
      id, case_id, entry_type, statement, official_name, rule_reference, occurred_at, recorded_at
    ) VALUES (@id, @caseId, @type, @statement, @officialName, @ruleReference, @occurredAt, @recordedAt)`,
      )
      .run({
        ...entry,
        occurredAt: entry.occurredAt.toISOString(),
        recordedAt: entry.recordedAt.toISOString(),
      });
  }

  findCaseById(id: string): ProtestCase | null {
    const row = this.db.prepare('SELECT * FROM protest_cases WHERE id = ?').get(id) as CaseRow | undefined;
    return row ? toCase(row) : null;
  }

  findCasesByScope(scopeType: ProtestScopeType, scopeId: string): ProtestCase[] {
    return (
      this.db
        .prepare('SELECT * FROM protest_cases WHERE scope_type = ? AND scope_id = ? ORDER BY lodged_at, rowid')
        .all(scopeType, scopeId) as CaseRow[]
    ).map(toCase);
  }

  findEntries(caseIds: readonly string[]): Map<string, ProtestEntry[]> {
    const result = new Map(caseIds.map((id) => [id, [] as ProtestEntry[]]));
    if (caseIds.length === 0) return result;
    const rows = this.db
      .prepare(
        `SELECT * FROM protest_entries WHERE case_id IN (${caseIds.map(() => '?').join(',')}) ORDER BY occurred_at, rowid`,
      )
      .all(...caseIds) as EntryRow[];
    for (const row of rows) result.get(row.case_id)?.push(toEntry(row));
    return result;
  }
}

function toCase(row: CaseRow): ProtestCase {
  return ProtestCase.reconstruct({
    id: row.id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    kind: row.kind,
    parentProtestId: row.parent_protest_id,
    subject: row.subject,
    statement: row.statement,
    lodgedBy: row.lodged_by,
    lodgedAt: new Date(row.lodged_at),
    triggeringDecisionAt: row.triggering_decision_at ? new Date(row.triggering_decision_at) : null,
    formReference: row.form_reference,
    feePaidEuro: row.fee_paid_euro,
    lateAcceptanceReason: row.late_acceptance_reason,
    openedBy: row.opened_by,
    createdAt: new Date(row.created_at),
  });
}
function toEntry(row: EntryRow): ProtestEntry {
  return ProtestEntry.reconstruct({
    id: row.id,
    caseId: row.case_id,
    type: row.entry_type,
    statement: row.statement,
    officialName: row.official_name,
    ruleReference: row.rule_reference,
    occurredAt: new Date(row.occurred_at),
    recordedAt: new Date(row.recorded_at),
  });
}
