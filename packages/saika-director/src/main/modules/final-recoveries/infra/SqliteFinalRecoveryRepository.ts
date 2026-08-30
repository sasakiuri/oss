import type Database from 'better-sqlite3';

import {
  FinalRecoveryCase,
  FinalRecoveryEntry,
  type FinalRecoveryClassification,
  type FinalRecoveryEntryType,
  type FinalRecoveryIncidentType,
  type FinalRecoveryPhase,
  type FinalRecoveryProcedureProfile,
  type FinalRecoveryRemedy,
} from '../domain/FinalRecoveryCase';
import type { IFinalRecoveryRepository } from '../domain/IFinalRecoveryRepository';

interface CaseRow {
  id: string;
  competition_id: string;
  event_id: string | null;
  final_run_id: string | null;
  script_step_id: string | null;
  script_step_snapshot: string | null;
  procedure_profile: FinalRecoveryProcedureProfile;
  incident_type: FinalRecoveryIncidentType;
  phase: FinalRecoveryPhase;
  affected_lane_ids_json: string;
  summary: string;
  opened_by: string;
  occurred_at: string;
  created_at: string;
}

interface EntryRow {
  id: string;
  case_id: string;
  entry_type: FinalRecoveryEntryType;
  statement: string;
  official_name: string;
  rule_reference: string | null;
  classification: FinalRecoveryClassification | null;
  remedy: FinalRecoveryRemedy | null;
  remaining_time_seconds: number | null;
  granted_time_seconds: number | null;
  shot_count: number | null;
  occurred_at: string;
  recorded_at: string;
}

export class SqliteFinalRecoveryRepository implements IFinalRecoveryRepository {
  constructor(private readonly db: Database.Database) {}

  appendCase(value: FinalRecoveryCase): void {
    this.db
      .prepare(
        `INSERT INTO final_recovery_cases (
          id, competition_id, event_id, final_run_id, script_step_id, script_step_snapshot,
          procedure_profile, incident_type, phase, affected_lane_ids_json, summary,
          opened_by, occurred_at, created_at
        ) VALUES (
          @id, @competitionId, @eventId, @finalRunId, @scriptStepId, @scriptStepSnapshot,
          @procedureProfile, @incidentType, @phase, @affectedLaneIdsJson, @summary,
          @openedBy, @occurredAt, @createdAt
        )`,
      )
      .run({
        ...value,
        affectedLaneIdsJson: JSON.stringify(value.affectedLaneIds),
        occurredAt: value.occurredAt.toISOString(),
        createdAt: value.createdAt.toISOString(),
      });
  }

  appendEntry(value: FinalRecoveryEntry): void {
    this.db
      .prepare(
        `INSERT INTO final_recovery_entries (
          id, case_id, entry_type, statement, official_name, rule_reference, classification,
          remedy, remaining_time_seconds, granted_time_seconds, shot_count, occurred_at, recorded_at
        ) VALUES (
          @id, @caseId, @type, @statement, @officialName, @ruleReference, @classification,
          @remedy, @remainingTimeSeconds, @grantedTimeSeconds, @shotCount, @occurredAt, @recordedAt
        )`,
      )
      .run({
        ...value,
        occurredAt: value.occurredAt.toISOString(),
        recordedAt: value.recordedAt.toISOString(),
      });
  }

  findCaseById(id: string): FinalRecoveryCase | null {
    const row = this.db.prepare('SELECT * FROM final_recovery_cases WHERE id = ?').get(id) as CaseRow | undefined;
    return row ? toCase(row) : null;
  }

  findCasesByCompetition(competitionId: string): FinalRecoveryCase[] {
    return this.findCases('competition_id', competitionId);
  }

  findCasesByEvent(eventId: string): FinalRecoveryCase[] {
    return this.findCases('event_id', eventId);
  }

  findEntries(caseIds: readonly string[]): Map<string, FinalRecoveryEntry[]> {
    const result = new Map(caseIds.map((id) => [id, [] as FinalRecoveryEntry[]]));
    if (caseIds.length === 0) return result;
    const rows = this.db
      .prepare(
        `SELECT * FROM final_recovery_entries
         WHERE case_id IN (${caseIds.map(() => '?').join(',')})
         ORDER BY recorded_at, rowid`,
      )
      .all(...caseIds) as EntryRow[];
    for (const row of rows) result.get(row.case_id)?.push(toEntry(row));
    return result;
  }

  private findCases(column: 'competition_id' | 'event_id', id: string): FinalRecoveryCase[] {
    return (
      this.db
        .prepare(`SELECT * FROM final_recovery_cases WHERE ${column} = ? ORDER BY occurred_at, rowid`)
        .all(id) as CaseRow[]
    ).map(toCase);
  }
}

function toCase(row: CaseRow): FinalRecoveryCase {
  const laneIds: unknown = JSON.parse(row.affected_lane_ids_json);
  if (!Array.isArray(laneIds) || !laneIds.every((value) => typeof value === 'string')) {
    throw new Error(`Final recovery case ${row.id} has invalid affected Lane IDs`);
  }
  return FinalRecoveryCase.reconstruct({
    id: row.id,
    competitionId: row.competition_id,
    eventId: row.event_id,
    finalRunId: row.final_run_id,
    scriptStepId: row.script_step_id,
    scriptStepSnapshot: row.script_step_snapshot,
    procedureProfile: row.procedure_profile,
    incidentType: row.incident_type,
    phase: row.phase,
    affectedLaneIds: laneIds,
    summary: row.summary,
    openedBy: row.opened_by,
    occurredAt: new Date(row.occurred_at),
    createdAt: new Date(row.created_at),
  });
}

function toEntry(row: EntryRow): FinalRecoveryEntry {
  return FinalRecoveryEntry.reconstruct({
    id: row.id,
    caseId: row.case_id,
    type: row.entry_type,
    statement: row.statement,
    officialName: row.official_name,
    ruleReference: row.rule_reference,
    classification: row.classification,
    remedy: row.remedy,
    remainingTimeSeconds: row.remaining_time_seconds,
    grantedTimeSeconds: row.granted_time_seconds,
    shotCount: row.shot_count,
    occurredAt: new Date(row.occurred_at),
    recordedAt: new Date(row.recorded_at),
  });
}
