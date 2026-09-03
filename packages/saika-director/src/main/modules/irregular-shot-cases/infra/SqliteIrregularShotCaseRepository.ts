import type Database from 'better-sqlite3';

import type { IIrregularShotCaseRepository } from '../domain/IIrregularShotCaseRepository';
import {
  IrregularShotCase,
  IrregularShotCaseEntry,
  IrregularShotEvidence,
  type IrregularShotEntryType,
  type IrregularShotEvidenceRelation,
  type IrregularShotKind,
  type IrregularShotResolutionCode,
  type IrregularShotResultScope,
} from '../domain/IrregularShotCase';

interface CaseRow {
  id: string;
  event_id: string;
  competition_id: string;
  result_scope: IrregularShotResultScope;
  kind: IrregularShotKind;
  subject_lane_id: string;
  adjacent_lane_ids_json: string;
  window_start_at: string;
  window_end_at: string;
  summary: string;
  rule_reference: string;
  opened_by: string;
  occurred_at: string;
  created_at: string;
}

interface EvidenceRow {
  id: string;
  case_id: string;
  relation: IrregularShotEvidenceRelation;
  observation_id: string;
  shot_id: string;
  lane_id: string;
  session_id: string;
  stage_index: number;
  series_index: number;
  shot_number_in_series: number;
  mode: 'SIGHTING' | 'MATCH';
  effective_score_x10: number;
  fired_at: string;
  received_at: string;
  statement: string;
  official_name: string;
  recorded_at: string;
}

interface EntryRow {
  id: string;
  case_id: string;
  entry_type: IrregularShotEntryType;
  statement: string;
  official_name: string;
  rule_reference: string | null;
  resolution_code: IrregularShotResolutionCode | null;
  incident_report_id: string | null;
  scoring_decision_ids_json: string;
  occurred_at: string;
  recorded_at: string;
}

export class SqliteIrregularShotCaseRepository implements IIrregularShotCaseRepository {
  constructor(private readonly db: Database.Database) {}

  appendCase(value: IrregularShotCase): void {
    this.db
      .prepare(
        `INSERT INTO irregular_shot_cases (
          id, event_id, competition_id, result_scope, kind, subject_lane_id,
          adjacent_lane_ids_json, window_start_at, window_end_at, summary,
          rule_reference, opened_by, occurred_at, created_at
        ) VALUES (
          @id, @eventId, @competitionId, @resultScope, @kind, @subjectLaneId,
          @adjacentLaneIdsJson, @windowStartAt, @windowEndAt, @summary,
          @ruleReference, @openedBy, @occurredAt, @createdAt
        )`,
      )
      .run({
        ...value,
        adjacentLaneIdsJson: JSON.stringify(value.adjacentLaneIds),
        windowStartAt: value.windowStartAt.toISOString(),
        windowEndAt: value.windowEndAt.toISOString(),
        occurredAt: value.occurredAt.toISOString(),
        createdAt: value.createdAt.toISOString(),
      });
  }

  appendEvidence(value: IrregularShotEvidence): void {
    this.db
      .prepare(
        `INSERT INTO irregular_shot_evidence (
          id, case_id, relation, observation_id, shot_id, lane_id, session_id,
          stage_index, series_index, shot_number_in_series, mode, effective_score_x10,
          fired_at, received_at, statement, official_name, recorded_at
        ) VALUES (
          @id, @caseId, @relation, @observationId, @shotId, @laneId, @sessionId,
          @stageIndex, @seriesIndex, @shotNumberInSeries, @mode, @effectiveScoreX10,
          @firedAt, @receivedAt, @statement, @officialName, @recordedAt
        )`,
      )
      .run({
        ...value,
        firedAt: value.firedAt.toISOString(),
        receivedAt: value.receivedAt.toISOString(),
        recordedAt: value.recordedAt.toISOString(),
      });
  }

  appendEntry(value: IrregularShotCaseEntry): void {
    this.db
      .prepare(
        `INSERT INTO irregular_shot_case_entries (
          id, case_id, entry_type, statement, official_name, rule_reference,
          resolution_code, incident_report_id, scoring_decision_ids_json,
          occurred_at, recorded_at
        ) VALUES (
          @id, @caseId, @type, @statement, @officialName, @ruleReference,
          @resolutionCode, @incidentReportId, @scoringDecisionIdsJson,
          @occurredAt, @recordedAt
        )`,
      )
      .run({
        ...value,
        scoringDecisionIdsJson: JSON.stringify(value.scoringDecisionIds),
        occurredAt: value.occurredAt.toISOString(),
        recordedAt: value.recordedAt.toISOString(),
      });
  }

  findCaseById(id: string): IrregularShotCase | null {
    const row = this.db.prepare('SELECT * FROM irregular_shot_cases WHERE id = ?').get(id) as CaseRow | undefined;
    return row ? toCase(row) : null;
  }

  findCasesByEvent(eventId: string, resultScope?: IrregularShotResultScope): IrregularShotCase[] {
    const rows = resultScope
      ? (this.db
          .prepare(
            `SELECT * FROM irregular_shot_cases
             WHERE event_id = ? AND result_scope = ? ORDER BY occurred_at, rowid`,
          )
          .all(eventId, resultScope) as CaseRow[])
      : (this.db
          .prepare('SELECT * FROM irregular_shot_cases WHERE event_id = ? ORDER BY occurred_at, rowid')
          .all(eventId) as CaseRow[]);
    return rows.map(toCase);
  }

  findEntries(caseIds: readonly string[]): Map<string, IrregularShotCaseEntry[]> {
    return collect(caseIds, this.db, 'irregular_shot_case_entries', (row) => toEntry(row as EntryRow));
  }

  findEvidence(caseIds: readonly string[]): Map<string, IrregularShotEvidence[]> {
    return collect(caseIds, this.db, 'irregular_shot_evidence', (row) => toEvidence(row as EvidenceRow));
  }
}

function collect<T>(
  caseIds: readonly string[],
  db: Database.Database,
  table: 'irregular_shot_case_entries' | 'irregular_shot_evidence',
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

function toCase(row: CaseRow): IrregularShotCase {
  return IrregularShotCase.reconstruct({
    id: row.id,
    eventId: row.event_id,
    competitionId: row.competition_id,
    resultScope: row.result_scope,
    kind: row.kind,
    subjectLaneId: row.subject_lane_id,
    adjacentLaneIds: JSON.parse(row.adjacent_lane_ids_json) as string[],
    windowStartAt: new Date(row.window_start_at),
    windowEndAt: new Date(row.window_end_at),
    summary: row.summary,
    ruleReference: row.rule_reference,
    openedBy: row.opened_by,
    occurredAt: new Date(row.occurred_at),
    createdAt: new Date(row.created_at),
  });
}

function toEvidence(row: EvidenceRow): IrregularShotEvidence {
  return IrregularShotEvidence.reconstruct({
    id: row.id,
    caseId: row.case_id,
    relation: row.relation,
    observationId: row.observation_id,
    shotId: row.shot_id,
    laneId: row.lane_id,
    sessionId: row.session_id,
    stageIndex: row.stage_index,
    seriesIndex: row.series_index,
    shotNumberInSeries: row.shot_number_in_series,
    mode: row.mode,
    effectiveScoreX10: row.effective_score_x10,
    firedAt: new Date(row.fired_at),
    receivedAt: new Date(row.received_at),
    statement: row.statement,
    officialName: row.official_name,
    recordedAt: new Date(row.recorded_at),
  });
}

function toEntry(row: EntryRow): IrregularShotCaseEntry {
  return IrregularShotCaseEntry.reconstruct({
    id: row.id,
    caseId: row.case_id,
    type: row.entry_type,
    statement: row.statement,
    officialName: row.official_name,
    ...(row.rule_reference ? { ruleReference: row.rule_reference } : {}),
    ...(row.resolution_code ? { resolutionCode: row.resolution_code } : {}),
    ...(row.incident_report_id ? { incidentReportId: row.incident_report_id } : {}),
    scoringDecisionIds: JSON.parse(row.scoring_decision_ids_json) as string[],
    occurredAt: new Date(row.occurred_at),
    recordedAt: new Date(row.recorded_at),
  });
}
