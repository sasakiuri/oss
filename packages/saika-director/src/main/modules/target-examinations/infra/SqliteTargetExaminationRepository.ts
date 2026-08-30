import type Database from 'better-sqlite3';

import type { ITargetExaminationRepository, TargetExaminationScope } from '../domain/ITargetExaminationRepository';
import { TargetExaminationCase, type TargetExaminationIssueKind } from '../domain/TargetExaminationCase';
import {
  getTargetExaminationState,
  TargetExaminationEntry,
  type TargetExaminationEntryType,
} from '../domain/TargetExaminationEntry';
import { TargetExaminationEvidence, type TargetExaminationEvidenceType } from '../domain/TargetExaminationEvidence';
import { TargetExaminationScopeLink, type TargetExaminationScopeType } from '../domain/TargetExaminationScopeLink';

interface CaseRow {
  id: string;
  issue_kind: TargetExaminationIssueKind;
  occurred_at: string;
  lane_id: string | null;
  firing_point_number: number | null;
  relay_number: number | null;
  athlete_name: string | null;
  shot_id: string | null;
  summary: string;
  details: string;
  rule_references: string;
  opened_by: string;
  created_at: string;
}

interface ScopeRow {
  id: string;
  case_id: string;
  scope_type: TargetExaminationScopeType;
  scope_id: string;
  linked_by: string;
  note: string | null;
  linked_at: string;
}

interface EvidenceRow {
  id: string;
  case_id: string;
  evidence_type: TargetExaminationEvidenceType;
  description: string;
  reference: string | null;
  content_hash_sha256: string | null;
  collected_by: string;
  collected_at: string;
  recorded_at: string;
}

interface EntryRow {
  id: string;
  case_id: string;
  entry_type: TargetExaminationEntryType;
  statement: string;
  rule_reference: string | null;
  official_name: string;
  recorded_at: string;
}

export class SqliteTargetExaminationRepository implements ITargetExaminationRepository {
  constructor(private readonly db: Database.Database) {}

  appendCase(examination: TargetExaminationCase, scopes: readonly TargetExaminationScopeLink[]): void {
    if (scopes.length === 0) throw new Error('A target examination must have at least one scope');
    if (scopes.some((scope) => scope.caseId !== examination.id)) {
      throw new Error('Every target examination scope must reference the new case');
    }

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO target_examination_cases (
             id, issue_kind, occurred_at, lane_id, firing_point_number,
             relay_number, athlete_name, shot_id, summary, details,
             rule_references, opened_by, created_at
           ) VALUES (
             @id, @issueKind, @occurredAt, @laneId, @firingPointNumber,
             @relayNumber, @athleteName, @shotId, @summary, @details,
             @ruleReferences, @openedBy, @createdAt
           )`,
        )
        .run({
          ...examination,
          occurredAt: examination.occurredAt.toISOString(),
          createdAt: examination.createdAt.toISOString(),
        });
      for (const scope of scopes) this.insertScope(scope);
    })();
  }

  findCaseById(id: string): TargetExaminationCase | null {
    const row = this.db.prepare('SELECT * FROM target_examination_cases WHERE id = ?').get(id) as CaseRow | undefined;
    return row ? toCase(row) : null;
  }

  findAllCases(): TargetExaminationCase[] {
    const rows = this.db
      .prepare('SELECT * FROM target_examination_cases ORDER BY occurred_at, rowid')
      .all() as CaseRow[];
    return rows.map(toCase);
  }

  findCasesByScope(scope: TargetExaminationScope): TargetExaminationCase[] {
    const rows = this.db
      .prepare(
        `SELECT examination.*
         FROM target_examination_cases examination
         INNER JOIN target_examination_scope_links scope ON scope.case_id = examination.id
         WHERE scope.scope_type = ? AND scope.scope_id = ?
         ORDER BY examination.occurred_at, examination.rowid`,
      )
      .all(scope.scopeType, scope.scopeId) as CaseRow[];
    return rows.map(toCase);
  }

  appendScope(scope: TargetExaminationScopeLink): void {
    this.insertScope(scope);
  }

  findScopesByCaseIds(caseIds: readonly string[]): Map<string, TargetExaminationScopeLink[]> {
    return this.findGrouped(
      caseIds,
      `SELECT * FROM target_examination_scope_links
       WHERE case_id IN (__PLACEHOLDERS__)
       ORDER BY linked_at, rowid`,
      (row: ScopeRow) => row.case_id,
      toScope,
    );
  }

  appendEvidence(evidence: TargetExaminationEvidence): void {
    this.db
      .prepare(
        `INSERT INTO target_examination_evidence (
           id, case_id, evidence_type, description, reference,
           content_hash_sha256, collected_by, collected_at, recorded_at
         ) VALUES (
           @id, @caseId, @type, @description, @reference,
           @contentHashSha256, @collectedBy, @collectedAt, @recordedAt
         )`,
      )
      .run({
        ...evidence,
        collectedAt: evidence.collectedAt.toISOString(),
        recordedAt: evidence.recordedAt.toISOString(),
      });
  }

  findEvidenceByCaseIds(caseIds: readonly string[]): Map<string, TargetExaminationEvidence[]> {
    return this.findGrouped(
      caseIds,
      `SELECT * FROM target_examination_evidence
       WHERE case_id IN (__PLACEHOLDERS__)
       ORDER BY recorded_at, rowid`,
      (row: EvidenceRow) => row.case_id,
      toEvidence,
    );
  }

  appendEntry(entry: TargetExaminationEntry): void {
    this.db
      .prepare(
        `INSERT INTO target_examination_entries (
           id, case_id, entry_type, statement, rule_reference,
           official_name, recorded_at
         ) VALUES (
           @id, @caseId, @type, @statement, @ruleReference,
           @officialName, @recordedAt
         )`,
      )
      .run({ ...entry, recordedAt: entry.recordedAt.toISOString() });
  }

  findEntriesByCaseIds(caseIds: readonly string[]): Map<string, TargetExaminationEntry[]> {
    return this.findGrouped(
      caseIds,
      `SELECT * FROM target_examination_entries
       WHERE case_id IN (__PLACEHOLDERS__)
       ORDER BY recorded_at, rowid`,
      (row: EntryRow) => row.case_id,
      toEntry,
    );
  }

  findActiveEvidenceHolds(scope: TargetExaminationScope, laneId?: string): TargetExaminationCase[] {
    const cases = this.findCasesByScope(scope).filter(
      (examination) => laneId === undefined || examination.laneId === null || examination.laneId === laneId,
    );
    const entries = this.findEntriesByCaseIds(cases.map((examination) => examination.id));
    return cases.filter(
      (examination) => getTargetExaminationState(entries.get(examination.id) ?? []).evidenceHoldActive,
    );
  }

  private insertScope(scope: TargetExaminationScopeLink): void {
    this.db
      .prepare(
        `INSERT INTO target_examination_scope_links (
           id, case_id, scope_type, scope_id, linked_by, note, linked_at
         ) VALUES (
           @id, @caseId, @scopeType, @scopeId, @linkedBy, @note, @linkedAt
         )`,
      )
      .run({ ...scope, linkedAt: scope.linkedAt.toISOString() });
  }

  private findGrouped<TRow, TValue>(
    ids: readonly string[],
    sql: string,
    getCaseId: (row: TRow) => string,
    map: (row: TRow) => TValue,
  ): Map<string, TValue[]> {
    const result = new Map<string, TValue[]>();
    for (const id of ids) result.set(id, []);
    if (ids.length === 0) return result;

    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db.prepare(sql.replace('__PLACEHOLDERS__', placeholders)).all(...ids) as TRow[];
    for (const row of rows) result.get(getCaseId(row))?.push(map(row));
    return result;
  }
}

function toCase(row: CaseRow): TargetExaminationCase {
  return TargetExaminationCase.reconstruct({
    id: row.id,
    issueKind: row.issue_kind,
    occurredAt: new Date(row.occurred_at),
    laneId: row.lane_id,
    firingPointNumber: row.firing_point_number,
    relayNumber: row.relay_number,
    athleteName: row.athlete_name,
    shotId: row.shot_id,
    summary: row.summary,
    details: row.details,
    ruleReferences: row.rule_references,
    openedBy: row.opened_by,
    createdAt: new Date(row.created_at),
  });
}

function toScope(row: ScopeRow): TargetExaminationScopeLink {
  return TargetExaminationScopeLink.reconstruct({
    id: row.id,
    caseId: row.case_id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    linkedBy: row.linked_by,
    note: row.note,
    linkedAt: new Date(row.linked_at),
  });
}

function toEvidence(row: EvidenceRow): TargetExaminationEvidence {
  return TargetExaminationEvidence.reconstruct({
    id: row.id,
    caseId: row.case_id,
    type: row.evidence_type,
    description: row.description,
    reference: row.reference,
    contentHashSha256: row.content_hash_sha256,
    collectedBy: row.collected_by,
    collectedAt: new Date(row.collected_at),
    recordedAt: new Date(row.recorded_at),
  });
}

function toEntry(row: EntryRow): TargetExaminationEntry {
  return TargetExaminationEntry.reconstruct({
    id: row.id,
    caseId: row.case_id,
    type: row.entry_type,
    statement: row.statement,
    ruleReference: row.rule_reference,
    officialName: row.official_name,
    recordedAt: new Date(row.recorded_at),
  });
}
