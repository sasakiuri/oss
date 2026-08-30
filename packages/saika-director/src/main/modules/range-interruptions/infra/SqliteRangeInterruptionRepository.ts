import type Database from 'better-sqlite3';

import type { IRangeInterruptionRepository, RangeInterruptionScope } from '../domain/IRangeInterruptionRepository';
import {
  RangeInterruptionCase,
  type RangeInterruptionCause,
  type RangeInterruptionPhase,
} from '../domain/RangeInterruptionCase';
import {
  getRangeInterruptionState,
  RangeInterruptionEntry,
  type RangeInterruptionEntryType,
} from '../domain/RangeInterruptionEntry';
import { RangeInterruptionScopeLink, type RangeInterruptionScopeType } from '../domain/RangeInterruptionScopeLink';
import { TargetRecoveryAssessment } from '../domain/TargetRecoveryAssessment';
import {
  RangeInterruptionCommandBatch,
  type RangeCommandLaneOutcome,
  type RangeCommandOperation,
} from '../domain/RangeInterruptionCommandBatch';

interface CaseRow {
  id: string;
  cause: RangeInterruptionCause;
  phase: RangeInterruptionPhase;
  started_at: string;
  remaining_seconds_at_start: number;
  lane_id: string | null;
  firing_point_number: number | null;
  athlete_name: string | null;
  summary: string;
  details: string;
  opened_by: string;
  created_at: string;
}

interface ScopeRow {
  id: string;
  case_id: string;
  scope_type: RangeInterruptionScopeType;
  scope_id: string;
  linked_by: string;
  note: string | null;
  linked_at: string;
}

interface EntryRow {
  id: string;
  case_id: string;
  entry_type: RangeInterruptionEntryType;
  occurred_at: string;
  statement: string;
  official_name: string;
  rule_reference: string | null;
  lost_time_seconds: number | null;
  extension_seconds: number | null;
  authorized_remaining_seconds: number | null;
  unlimited_sighting_shots: number | null;
  incident_report_reference: string | null;
  command_id: string | null;
  recorded_at: string;
}

interface TargetRecoveryAssessmentRow {
  id: string;
  case_id: string;
  repair_completed_at: string | null;
  moved_to_reserve_firing_point: number;
  reserve_firing_point_number: number | null;
  statement: string;
  official_name: string;
  assessed_at: string;
}

interface CommandBatchRow {
  id: string;
  case_id: string;
  competition_id: string;
  operation: RangeCommandOperation;
  target_lane_ids_json: string;
  success: number;
  results_json: string;
  official_name: string;
  occurred_at: string;
  recorded_at: string;
}

export class SqliteRangeInterruptionRepository implements IRangeInterruptionRepository {
  constructor(private readonly db: Database.Database) {}

  appendCase(interruption: RangeInterruptionCase, scopes: readonly RangeInterruptionScopeLink[]): void {
    if (scopes.length === 0) throw new Error('A range interruption must have at least one scope');
    if (scopes.some((scope) => scope.caseId !== interruption.id)) {
      throw new Error('Every range interruption scope must reference the new case');
    }

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO range_interruption_cases (
             id, cause, phase, started_at, remaining_seconds_at_start,
             lane_id, firing_point_number, athlete_name, summary, details,
             opened_by, created_at
           ) VALUES (
             @id, @cause, @phase, @startedAt, @remainingSecondsAtStart,
             @laneId, @firingPointNumber, @athleteName, @summary, @details,
             @openedBy, @createdAt
           )`,
        )
        .run({
          ...interruption,
          startedAt: interruption.startedAt.toISOString(),
          createdAt: interruption.createdAt.toISOString(),
        });
      for (const scope of scopes) this.insertScope(scope);
    })();
  }

  findCaseById(id: string): RangeInterruptionCase | null {
    const row = this.db.prepare('SELECT * FROM range_interruption_cases WHERE id = ?').get(id) as CaseRow | undefined;
    return row ? toCase(row) : null;
  }

  findAllCases(): RangeInterruptionCase[] {
    const rows = this.db
      .prepare('SELECT * FROM range_interruption_cases ORDER BY started_at, rowid')
      .all() as CaseRow[];
    return rows.map(toCase);
  }

  findCasesByScope(scope: RangeInterruptionScope): RangeInterruptionCase[] {
    const rows = this.db
      .prepare(
        `SELECT interruption.*
         FROM range_interruption_cases interruption
         INNER JOIN range_interruption_scope_links scope ON scope.case_id = interruption.id
         WHERE scope.scope_type = ? AND scope.scope_id = ?
         ORDER BY interruption.started_at, interruption.rowid`,
      )
      .all(scope.scopeType, scope.scopeId) as CaseRow[];
    return rows.map(toCase);
  }

  appendScope(scope: RangeInterruptionScopeLink): void {
    this.insertScope(scope);
  }

  findScopesByCaseIds(caseIds: readonly string[]): Map<string, RangeInterruptionScopeLink[]> {
    return this.findGrouped(
      caseIds,
      `SELECT * FROM range_interruption_scope_links
       WHERE case_id IN (__PLACEHOLDERS__)
       ORDER BY linked_at, rowid`,
      (row: ScopeRow) => row.case_id,
      toScope,
    );
  }

  appendEntry(entry: RangeInterruptionEntry): void {
    this.db
      .prepare(
        `INSERT INTO range_interruption_entries (
           id, case_id, entry_type, occurred_at, statement, official_name,
           rule_reference, lost_time_seconds, extension_seconds,
           authorized_remaining_seconds, unlimited_sighting_shots,
           incident_report_reference, command_id, recorded_at
         ) VALUES (
           @id, @caseId, @type, @occurredAt, @statement, @officialName,
           @ruleReference, @lostTimeSeconds, @extensionSeconds,
           @authorizedRemainingSeconds, @unlimitedSightingShots,
           @incidentReportReference, @commandId, @recordedAt
         )`,
      )
      .run({
        ...entry,
        occurredAt: entry.occurredAt.toISOString(),
        unlimitedSightingShots: entry.unlimitedSightingShots === null ? null : entry.unlimitedSightingShots ? 1 : 0,
        recordedAt: entry.recordedAt.toISOString(),
      });
  }

  findEntriesByCaseIds(caseIds: readonly string[]): Map<string, RangeInterruptionEntry[]> {
    return this.findGrouped(
      caseIds,
      `SELECT * FROM range_interruption_entries
       WHERE case_id IN (__PLACEHOLDERS__)
       ORDER BY recorded_at, rowid`,
      (row: EntryRow) => row.case_id,
      toEntry,
    );
  }

  appendTargetRecoveryAssessment(assessment: TargetRecoveryAssessment): void {
    this.db
      .prepare(
        `INSERT INTO target_recovery_assessments (
           id, case_id, repair_completed_at, moved_to_reserve_firing_point,
           reserve_firing_point_number, statement, official_name, assessed_at
         ) VALUES (
           @id, @caseId, @repairCompletedAt, @movedToReserveFiringPoint,
           @reserveFiringPointNumber, @statement, @officialName, @assessedAt
         )`,
      )
      .run({
        ...assessment,
        repairCompletedAt: assessment.repairCompletedAt?.toISOString() ?? null,
        movedToReserveFiringPoint: Number(assessment.movedToReserveFiringPoint),
        assessedAt: assessment.assessedAt.toISOString(),
      });
  }

  findTargetRecoveryAssessmentsByCaseIds(caseIds: readonly string[]): Map<string, TargetRecoveryAssessment[]> {
    return this.findGrouped(
      caseIds,
      `SELECT * FROM target_recovery_assessments
       WHERE case_id IN (__PLACEHOLDERS__)
       ORDER BY assessed_at, rowid`,
      (row: TargetRecoveryAssessmentRow) => row.case_id,
      toTargetRecoveryAssessment,
    );
  }

  appendCommandBatch(batch: RangeInterruptionCommandBatch, transitionEntry?: RangeInterruptionEntry): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO range_interruption_command_batches (
           id, case_id, competition_id, operation, target_lane_ids_json, success, results_json,
           official_name, occurred_at, recorded_at
         ) VALUES (
           @id, @caseId, @competitionId, @operation, @targetLaneIdsJson, @success, @resultsJson,
           @officialName, @occurredAt, @recordedAt
         )`,
        )
        .run({
          id: batch.id,
          caseId: batch.caseId,
          competitionId: batch.competitionId,
          operation: batch.operation,
          targetLaneIdsJson: JSON.stringify(batch.targetLaneIds),
          success: Number(batch.success),
          resultsJson: JSON.stringify(batch.outcomes),
          officialName: batch.officialName,
          occurredAt: batch.occurredAt.toISOString(),
          recordedAt: batch.recordedAt.toISOString(),
        });
      if (transitionEntry) this.insertEntry(transitionEntry);
    })();
  }

  findCommandBatchesByCaseIds(caseIds: readonly string[]): Map<string, RangeInterruptionCommandBatch[]> {
    return this.findGrouped(
      caseIds,
      `SELECT * FROM range_interruption_command_batches
       WHERE case_id IN (__PLACEHOLDERS__)
       ORDER BY recorded_at, rowid`,
      (row: CommandBatchRow) => row.case_id,
      toCommandBatch,
    );
  }

  findActiveDataHolds(scope: RangeInterruptionScope, laneId?: string): RangeInterruptionCase[] {
    const cases = this.findCasesByScope(scope).filter(
      (interruption) => laneId === undefined || interruption.laneId === null || interruption.laneId === laneId,
    );
    const entries = this.findEntriesByCaseIds(cases.map((interruption) => interruption.id));
    return cases.filter((interruption) => getRangeInterruptionState(entries.get(interruption.id) ?? []).dataHoldActive);
  }

  private insertScope(scope: RangeInterruptionScopeLink): void {
    this.db
      .prepare(
        `INSERT INTO range_interruption_scope_links (
           id, case_id, scope_type, scope_id, linked_by, note, linked_at
         ) VALUES (
           @id, @caseId, @scopeType, @scopeId, @linkedBy, @note, @linkedAt
         )`,
      )
      .run({ ...scope, linkedAt: scope.linkedAt.toISOString() });
  }

  private insertEntry(entry: RangeInterruptionEntry): void {
    this.db
      .prepare(
        `INSERT INTO range_interruption_entries (
           id, case_id, entry_type, occurred_at, statement, official_name,
           rule_reference, lost_time_seconds, extension_seconds,
           authorized_remaining_seconds, unlimited_sighting_shots,
           incident_report_reference, command_id, recorded_at
         ) VALUES (
           @id, @caseId, @type, @occurredAt, @statement, @officialName,
           @ruleReference, @lostTimeSeconds, @extensionSeconds,
           @authorizedRemainingSeconds, @unlimitedSightingShots,
           @incidentReportReference, @commandId, @recordedAt
         )`,
      )
      .run({
        ...entry,
        occurredAt: entry.occurredAt.toISOString(),
        unlimitedSightingShots: entry.unlimitedSightingShots === null ? null : entry.unlimitedSightingShots ? 1 : 0,
        recordedAt: entry.recordedAt.toISOString(),
      });
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

function toCase(row: CaseRow): RangeInterruptionCase {
  return RangeInterruptionCase.reconstruct({
    id: row.id,
    cause: row.cause,
    phase: row.phase,
    startedAt: new Date(row.started_at),
    remainingSecondsAtStart: row.remaining_seconds_at_start,
    laneId: row.lane_id,
    firingPointNumber: row.firing_point_number,
    athleteName: row.athlete_name,
    summary: row.summary,
    details: row.details,
    openedBy: row.opened_by,
    createdAt: new Date(row.created_at),
  });
}

function toScope(row: ScopeRow): RangeInterruptionScopeLink {
  return RangeInterruptionScopeLink.reconstruct({
    id: row.id,
    caseId: row.case_id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    linkedBy: row.linked_by,
    note: row.note,
    linkedAt: new Date(row.linked_at),
  });
}

function toEntry(row: EntryRow): RangeInterruptionEntry {
  return RangeInterruptionEntry.reconstruct({
    id: row.id,
    caseId: row.case_id,
    type: row.entry_type,
    occurredAt: new Date(row.occurred_at),
    statement: row.statement,
    officialName: row.official_name,
    ruleReference: row.rule_reference,
    lostTimeSeconds: row.lost_time_seconds,
    extensionSeconds: row.extension_seconds,
    authorizedRemainingSeconds: row.authorized_remaining_seconds,
    unlimitedSightingShots: row.unlimited_sighting_shots === null ? null : row.unlimited_sighting_shots === 1,
    incidentReportReference: row.incident_report_reference,
    commandId: row.command_id,
    recordedAt: new Date(row.recorded_at),
  });
}

function toTargetRecoveryAssessment(row: TargetRecoveryAssessmentRow): TargetRecoveryAssessment {
  return TargetRecoveryAssessment.reconstruct({
    id: row.id,
    caseId: row.case_id,
    repairCompletedAt: row.repair_completed_at === null ? null : new Date(row.repair_completed_at),
    movedToReserveFiringPoint: row.moved_to_reserve_firing_point === 1,
    reserveFiringPointNumber: row.reserve_firing_point_number,
    statement: row.statement,
    officialName: row.official_name,
    assessedAt: new Date(row.assessed_at),
  });
}

function toCommandBatch(row: CommandBatchRow): RangeInterruptionCommandBatch {
  const outcomes = JSON.parse(row.results_json) as RangeCommandLaneOutcome[];
  const batch = RangeInterruptionCommandBatch.reconstruct({
    id: row.id,
    caseId: row.case_id,
    competitionId: row.competition_id,
    operation: row.operation,
    targetLaneIds: JSON.parse(row.target_lane_ids_json) as string[],
    outcomes,
    officialName: row.official_name,
    occurredAt: new Date(row.occurred_at),
    recordedAt: new Date(row.recorded_at),
  });
  if (batch.success !== (row.success === 1))
    throw new Error(`Stored range batch ${row.id} has inconsistent success state`);
  return batch;
}
