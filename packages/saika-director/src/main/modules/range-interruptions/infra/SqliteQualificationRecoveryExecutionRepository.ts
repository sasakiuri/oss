import type Database from 'better-sqlite3';

import type { IQualificationRecoveryExecutionRepository } from '../domain/IQualificationRecoveryExecutionRepository';
import {
  createQualificationRecoveryExecutionEvent,
  createQualificationRecoveryExecutionRecord,
  createQualificationRecoveryExecutionStart,
  type QualificationRecoveryExecutionEvent,
  type QualificationRecoveryExecutionEventPayload,
  type QualificationRecoveryExecutionEventType,
  type QualificationRecoveryExecutionPhase,
  type QualificationRecoveryExecutionRecord,
  type QualificationRecoveryExecutionStart,
} from '../domain/QualificationRecoveryExecution';
import type { QualificationRecoveryFiringAuthorizationPayload } from '@/shared/mqtt';

interface StartRow {
  run_id: string;
  case_id: string;
  decision_id: string;
  competition_id: string;
  lane_id: string;
  phase: QualificationRecoveryExecutionPhase;
  stage_index: number;
  series_index: number;
  expected_match_program_id: string;
  expected_series_shot_limit: number;
  expected_recorded_shots: number;
  authorization_json: string;
  official_name: string;
  decision_rule_reference: string;
  decided_at: string;
  requested_at: string;
}

interface EventRow {
  id: string;
  event_key: string;
  run_id: string;
  event_type: QualificationRecoveryExecutionEventType;
  payload_json: string;
  occurred_at: string;
  recorded_at: string;
}

export class SqliteQualificationRecoveryExecutionRepository implements IQualificationRecoveryExecutionRepository {
  constructor(private readonly db: Database.Database) {}

  appendStart(start: QualificationRecoveryExecutionStart): QualificationRecoveryExecutionStart {
    const value = createQualificationRecoveryExecutionStart(start);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO qualification_recovery_executions (
           run_id, case_id, decision_id, competition_id, lane_id, phase,
           stage_index, series_index, expected_match_program_id,
           expected_series_shot_limit, expected_recorded_shots, authorization_json,
           official_name, decision_rule_reference, decided_at, requested_at
         ) VALUES (
           @runId, @caseId, @decisionId, @competitionId, @laneId, @phase,
           @stageIndex, @seriesIndex, @expectedMatchProgramId,
           @expectedSeriesShotLimit, @expectedRecordedShots, @authorizationJson,
           @officialName, @decisionRuleReference, @decidedAt, @requestedAt
         )`,
      )
      .run({
        ...value,
        authorizationJson: JSON.stringify(value.authorization),
        decidedAt: value.decidedAt.toISOString(),
        requestedAt: value.requestedAt.toISOString(),
      });

    const stored = this.findStartByDecisionPhase(value.decisionId, value.phase);
    if (!stored) throw new Error('Qualification recovery execution start was not stored');
    if (!sameBinding(stored, value)) {
      throw new Error(
        `Qualification recovery decision ${value.decisionId} phase ${value.phase} is bound to different immutable facts`,
      );
    }
    return stored;
  }

  appendEvent(event: QualificationRecoveryExecutionEvent): void {
    const value = createQualificationRecoveryExecutionEvent(event);
    const payloadJson = JSON.stringify(value.payload);
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO qualification_recovery_execution_events (
           id, event_key, run_id, event_type, payload_json, occurred_at, recorded_at
         ) VALUES (@id, @eventKey, @runId, @type, @payloadJson, @occurredAt, @recordedAt)`,
      )
      .run({
        ...value,
        payloadJson,
        occurredAt: value.occurredAt.toISOString(),
        recordedAt: value.recordedAt.toISOString(),
      });
    if (result.changes > 0) return;

    const existing = this.db
      .prepare('SELECT * FROM qualification_recovery_execution_events WHERE event_key = ?')
      .get(value.eventKey) as EventRow | undefined;
    if (
      !existing ||
      existing.run_id !== value.runId ||
      existing.event_type !== value.type ||
      existing.payload_json !== payloadJson ||
      existing.occurred_at !== value.occurredAt.toISOString()
    ) {
      throw new Error(`Qualification recovery event key ${value.eventKey} was reused with different evidence`);
    }
  }

  findByRunId(runId: string): QualificationRecoveryExecutionRecord | null {
    const row = this.db.prepare('SELECT * FROM qualification_recovery_executions WHERE run_id = ?').get(runId) as
      StartRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  findByDecisionPhase(
    decisionId: string,
    phase: QualificationRecoveryExecutionPhase,
  ): QualificationRecoveryExecutionRecord | null {
    const row = this.db
      .prepare('SELECT * FROM qualification_recovery_executions WHERE decision_id = ? AND phase = ?')
      .get(decisionId, phase) as StartRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  findByCaseIds(caseIds: readonly string[]): Map<string, QualificationRecoveryExecutionRecord[]> {
    const result = new Map<string, QualificationRecoveryExecutionRecord[]>(caseIds.map((caseId) => [caseId, []]));
    if (caseIds.length === 0) return result;
    const placeholders = caseIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT * FROM qualification_recovery_executions
         WHERE case_id IN (${placeholders})
         ORDER BY requested_at, rowid`,
      )
      .all(...caseIds) as StartRow[];
    for (const row of rows) result.get(row.case_id)?.push(this.toRecord(row));
    return result;
  }

  private findStartByDecisionPhase(
    decisionId: string,
    phase: QualificationRecoveryExecutionPhase,
  ): QualificationRecoveryExecutionStart | null {
    const row = this.db
      .prepare('SELECT * FROM qualification_recovery_executions WHERE decision_id = ? AND phase = ?')
      .get(decisionId, phase) as StartRow | undefined;
    return row ? toStart(row) : null;
  }

  private toRecord(row: StartRow): QualificationRecoveryExecutionRecord {
    const eventRows = this.db
      .prepare(
        `SELECT * FROM qualification_recovery_execution_events
         WHERE run_id = ? ORDER BY recorded_at, rowid`,
      )
      .all(row.run_id) as EventRow[];
    return createQualificationRecoveryExecutionRecord(toStart(row), eventRows.map(toEvent));
  }
}

function toStart(row: StartRow): QualificationRecoveryExecutionStart {
  return createQualificationRecoveryExecutionStart({
    runId: row.run_id,
    caseId: row.case_id,
    decisionId: row.decision_id,
    competitionId: row.competition_id,
    laneId: row.lane_id,
    phase: row.phase,
    stageIndex: row.stage_index,
    seriesIndex: row.series_index,
    expectedMatchProgramId: row.expected_match_program_id,
    expectedSeriesShotLimit: row.expected_series_shot_limit,
    expectedRecordedShots: row.expected_recorded_shots,
    authorization: JSON.parse(row.authorization_json) as QualificationRecoveryFiringAuthorizationPayload,
    officialName: row.official_name,
    decisionRuleReference: row.decision_rule_reference,
    decidedAt: new Date(row.decided_at),
    requestedAt: new Date(row.requested_at),
  });
}

function toEvent(row: EventRow): QualificationRecoveryExecutionEvent {
  return createQualificationRecoveryExecutionEvent({
    id: row.id,
    eventKey: row.event_key,
    runId: row.run_id,
    type: row.event_type,
    payload: JSON.parse(row.payload_json) as QualificationRecoveryExecutionEventPayload,
    occurredAt: new Date(row.occurred_at),
    recordedAt: new Date(row.recorded_at),
  });
}

function sameBinding(left: QualificationRecoveryExecutionStart, right: QualificationRecoveryExecutionStart): boolean {
  return JSON.stringify(serializeBinding(left)) === JSON.stringify(serializeBinding(right));
}

function serializeBinding(start: QualificationRecoveryExecutionStart): Record<string, unknown> {
  const { runId: _runId, requestedAt: _requestedAt, ...binding } = start;
  return {
    ...binding,
    decidedAt: start.decidedAt.toISOString(),
  };
}
