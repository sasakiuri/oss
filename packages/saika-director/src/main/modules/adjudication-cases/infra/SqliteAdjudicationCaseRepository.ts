import type Database from 'better-sqlite3';

import type { IAdjudicationCaseRepository } from '../domain/IAdjudicationCaseRepository';
import {
  AdjudicationCase,
  AdjudicationCaseEntry,
  AdjudicationCaseLink,
  type AdjudicationArtifactType,
  type AdjudicationCaseCategory,
  type AdjudicationCaseEntryType,
  type AdjudicationCaseLinkOperation,
  type AdjudicationCaseScopeType,
  type AdjudicationLinkRelation,
} from '../domain/AdjudicationCase';

interface CaseRow {
  id: string;
  scope_type: AdjudicationCaseScopeType;
  scope_id: string;
  category: AdjudicationCaseCategory;
  subject: string;
  summary: string;
  opened_by: string;
  opened_at: string;
  created_at: string;
}

interface EntryRow {
  id: string;
  case_id: string;
  entry_type: AdjudicationCaseEntryType;
  statement: string;
  official_name: string;
  rule_reference: string | null;
  occurred_at: string;
  recorded_at: string;
}

interface LinkRow {
  id: string;
  case_id: string;
  operation: AdjudicationCaseLinkOperation;
  artifact_type: AdjudicationArtifactType;
  artifact_id: string;
  relation: AdjudicationLinkRelation;
  label_snapshot: string;
  statement: string;
  official_name: string;
  recorded_at: string;
  reverses_link_id: string | null;
}

export class SqliteAdjudicationCaseRepository implements IAdjudicationCaseRepository {
  constructor(private readonly db: Database.Database) {}

  appendCase(value: AdjudicationCase): void {
    this.db
      .prepare(
        `INSERT INTO adjudication_cases (
          id, scope_type, scope_id, category, subject, summary, opened_by, opened_at, created_at
        ) VALUES (
          @id, @scopeType, @scopeId, @category, @subject, @summary, @openedBy, @openedAt, @createdAt
        )`,
      )
      .run({ ...value, openedAt: value.openedAt.toISOString(), createdAt: value.createdAt.toISOString() });
  }

  appendEntry(value: AdjudicationCaseEntry): void {
    this.db
      .prepare(
        `INSERT INTO adjudication_case_entries (
          id, case_id, entry_type, statement, official_name, rule_reference, occurred_at, recorded_at
        ) VALUES (
          @id, @caseId, @type, @statement, @officialName, @ruleReference, @occurredAt, @recordedAt
        )`,
      )
      .run({ ...value, occurredAt: value.occurredAt.toISOString(), recordedAt: value.recordedAt.toISOString() });
  }

  appendLink(value: AdjudicationCaseLink): void {
    this.db
      .prepare(
        `INSERT INTO adjudication_case_links (
          id, case_id, operation, artifact_type, artifact_id, relation, label_snapshot,
          statement, official_name, recorded_at, reverses_link_id
        ) VALUES (
          @id, @caseId, @operation, @artifactType, @artifactId, @relation, @labelSnapshot,
          @statement, @officialName, @recordedAt, @reversesLinkId
        )`,
      )
      .run({ ...value, recordedAt: value.recordedAt.toISOString() });
  }

  findCaseById(id: string): AdjudicationCase | null {
    const row = this.db.prepare('SELECT * FROM adjudication_cases WHERE id = ?').get(id) as CaseRow | undefined;
    return row ? toCase(row) : null;
  }

  findCasesByScope(scopeType: AdjudicationCaseScopeType, scopeId: string): AdjudicationCase[] {
    return (
      this.db
        .prepare('SELECT * FROM adjudication_cases WHERE scope_type = ? AND scope_id = ? ORDER BY opened_at, rowid')
        .all(scopeType, scopeId) as CaseRow[]
    ).map(toCase);
  }

  findEntries(caseIds: readonly string[]): Map<string, AdjudicationCaseEntry[]> {
    return collectByCase(caseIds, this.db, 'adjudication_case_entries', (row) => toEntry(row as EntryRow));
  }

  findLinks(caseIds: readonly string[]): Map<string, AdjudicationCaseLink[]> {
    return collectByCase(caseIds, this.db, 'adjudication_case_links', (row) => toLink(row as LinkRow));
  }
}

function collectByCase<T>(
  caseIds: readonly string[],
  db: Database.Database,
  table: 'adjudication_case_entries' | 'adjudication_case_links',
  map: (row: unknown) => T,
): Map<string, T[]> {
  const result = new Map(caseIds.map((id) => [id, [] as T[]]));
  if (caseIds.length === 0) return result;
  const rows = db
    .prepare(
      `SELECT * FROM ${table} WHERE case_id IN (${caseIds.map(() => '?').join(',')}) ORDER BY recorded_at, rowid`,
    )
    .all(...caseIds) as Array<{ case_id: string }>;
  for (const row of rows) result.get(row.case_id)?.push(map(row));
  return result;
}

function toCase(row: CaseRow): AdjudicationCase {
  return AdjudicationCase.reconstruct({
    id: row.id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    category: row.category,
    subject: row.subject,
    summary: row.summary,
    openedBy: row.opened_by,
    openedAt: new Date(row.opened_at),
    createdAt: new Date(row.created_at),
  });
}

function toEntry(row: EntryRow): AdjudicationCaseEntry {
  return AdjudicationCaseEntry.reconstruct({
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

function toLink(row: LinkRow): AdjudicationCaseLink {
  return AdjudicationCaseLink.reconstruct({
    id: row.id,
    caseId: row.case_id,
    operation: row.operation,
    artifactType: row.artifact_type,
    artifactId: row.artifact_id,
    relation: row.relation,
    labelSnapshot: row.label_snapshot,
    statement: row.statement,
    officialName: row.official_name,
    recordedAt: new Date(row.recorded_at),
    reversesLinkId: row.reverses_link_id,
  });
}
