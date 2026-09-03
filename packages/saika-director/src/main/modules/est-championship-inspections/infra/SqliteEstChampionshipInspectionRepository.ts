import type Database from 'better-sqlite3';

import type { IEstChampionshipInspectionRepository } from '../domain/IEstChampionshipInspectionRepository';
import { EstInspectionEntry, EstInspectionPlan, type EstInspectionOutcome } from '../domain/EstChampionshipInspection';

interface PlanRow {
  id: string;
  championship_id: string;
  version_number: number;
  target_identifiers_json: string;
  method_statement: string;
  created_by: string;
  created_at: string;
}

interface EntryRow {
  id: string;
  plan_id: string;
  target_identifier: string;
  outcome: EstInspectionOutcome;
  statement: string;
  evidence_reference: string | null;
  performed_by: string;
  technical_delegate_name: string;
  inspected_at: string;
  recorded_at: string;
  revoked_entry_id: string | null;
}

export class SqliteEstChampionshipInspectionRepository implements IEstChampionshipInspectionRepository {
  constructor(private readonly db: Database.Database) {}

  appendPlan(plan: EstInspectionPlan): void {
    this.db
      .prepare(
        `INSERT INTO est_inspection_plans (
          id, championship_id, version_number, target_identifiers_json,
          method_statement, created_by, created_at
        ) VALUES (
          @id, @championshipId, @versionNumber, @targetIdentifiersJson,
          @methodStatement, @createdBy, @createdAt
        )`,
      )
      .run({
        ...plan,
        targetIdentifiersJson: JSON.stringify(plan.targetIdentifiers),
        createdAt: plan.createdAt.toISOString(),
      });
  }

  appendEntries(entries: readonly EstInspectionEntry[]): void {
    const insert = this.db.prepare(
      `INSERT INTO est_inspection_entries (
        id, plan_id, target_identifier, outcome, statement, evidence_reference,
        performed_by, technical_delegate_name, inspected_at, recorded_at, revoked_entry_id
      ) VALUES (
        @id, @planId, @targetIdentifier, @outcome, @statement, @evidenceReference,
        @performedBy, @technicalDelegateName, @inspectedAt, @recordedAt, @revokedEntryId
      )`,
    );
    this.db.transaction((values: readonly EstInspectionEntry[]) => {
      for (const entry of values) {
        insert.run({
          ...entry,
          inspectedAt: entry.inspectedAt.toISOString(),
          recordedAt: entry.recordedAt.toISOString(),
        });
      }
    })(entries);
  }

  findPlans(championshipId: string): EstInspectionPlan[] {
    return (
      this.db
        .prepare('SELECT * FROM est_inspection_plans WHERE championship_id = ? ORDER BY version_number, rowid')
        .all(championshipId) as PlanRow[]
    ).map(toPlan);
  }

  findPlanById(planId: string): EstInspectionPlan | null {
    const row = this.db.prepare('SELECT * FROM est_inspection_plans WHERE id = ?').get(planId) as PlanRow | undefined;
    return row ? toPlan(row) : null;
  }

  findEntries(planId: string): EstInspectionEntry[] {
    return (
      this.db
        .prepare('SELECT * FROM est_inspection_entries WHERE plan_id = ? ORDER BY recorded_at, rowid')
        .all(planId) as EntryRow[]
    ).map(toEntry);
  }

  findEntryById(entryId: string): EstInspectionEntry | null {
    const row = this.db.prepare('SELECT * FROM est_inspection_entries WHERE id = ?').get(entryId) as
      EntryRow | undefined;
    return row ? toEntry(row) : null;
  }
}

function toPlan(row: PlanRow): EstInspectionPlan {
  return EstInspectionPlan.reconstruct({
    id: row.id,
    championshipId: row.championship_id,
    versionNumber: row.version_number,
    targetIdentifiers: JSON.parse(row.target_identifiers_json) as string[],
    methodStatement: row.method_statement,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
  });
}

function toEntry(row: EntryRow): EstInspectionEntry {
  return EstInspectionEntry.reconstruct({
    id: row.id,
    planId: row.plan_id,
    targetIdentifier: row.target_identifier,
    outcome: row.outcome,
    statement: row.statement,
    ...(row.evidence_reference ? { evidenceReference: row.evidence_reference } : {}),
    performedBy: row.performed_by,
    technicalDelegateName: row.technical_delegate_name,
    inspectedAt: new Date(row.inspected_at),
    recordedAt: new Date(row.recorded_at),
    ...(row.revoked_entry_id ? { revokedEntryId: row.revoked_entry_id } : {}),
  });
}
