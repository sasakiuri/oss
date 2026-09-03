import type Database from 'better-sqlite3';

import type { IQualificationRecoverySettlementRepository } from '../domain/IQualificationRecoverySettlementRepository';
import {
  createQualificationRecoverySettlementEvent,
  createQualificationRecoverySettlementRecord,
  createQualificationRecoverySettlementRequest,
  type QualificationRecoverySettlementEvent,
  type QualificationRecoverySettlementEventPayload,
  type QualificationRecoverySettlementEventType,
  type QualificationRecoverySettlementRecord,
  type QualificationRecoverySettlementRequest,
} from '../domain/QualificationRecoverySettlement';

interface RequestRow {
  settlement_id: string;
  case_id: string;
  decision_id: string;
  competition_id: string;
  lane_id: string;
  treatment: 'KEEP_RECORDED_SERIES';
  stage_index: number;
  series_index: number;
  expected_match_program_id: string;
  expected_series_shot_limit: number;
  expected_recorded_shots: number;
  decision_official_name: string;
  decision_rule_reference: string;
  decided_at: string;
  applied_by: string;
  statement: string;
  applied_at: string;
  requested_at: string;
}

interface EventRow {
  id: string;
  event_key: string;
  settlement_id: string;
  event_type: QualificationRecoverySettlementEventType;
  payload_json: string;
  occurred_at: string;
  recorded_at: string;
}

export class SqliteQualificationRecoverySettlementRepository implements IQualificationRecoverySettlementRepository {
  constructor(private readonly db: Database.Database) {}

  appendRequest(request: QualificationRecoverySettlementRequest): QualificationRecoverySettlementRequest {
    const value = createQualificationRecoverySettlementRequest(request);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO qualification_recovery_settlement_requests (
           settlement_id, case_id, decision_id, competition_id, lane_id, treatment,
           stage_index, series_index, expected_match_program_id, expected_series_shot_limit,
           expected_recorded_shots, decision_official_name, decision_rule_reference,
           decided_at, applied_by, statement, applied_at, requested_at
         ) VALUES (
           @settlementId, @caseId, @decisionId, @competitionId, @laneId, @treatment,
           @stageIndex, @seriesIndex, @expectedMatchProgramId, @expectedSeriesShotLimit,
           @expectedRecordedShots, @decisionOfficialName, @decisionRuleReference,
           @decidedAt, @appliedBy, @statement, @appliedAt, @requestedAt
         )`,
      )
      .run(serializeRequest(value));

    const stored = this.findRequestByDecisionId(value.decisionId);
    if (!stored) throw new Error('Qualification recovery settlement request was not stored');
    if (!sameBinding(stored, value)) {
      throw new Error(`Qualification recovery decision ${value.decisionId} is bound to a different settlement request`);
    }
    return stored;
  }

  appendEvent(event: QualificationRecoverySettlementEvent): void {
    const value = createQualificationRecoverySettlementEvent(event);
    const payloadJson = JSON.stringify(value.payload);
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO qualification_recovery_settlement_events (
           id, event_key, settlement_id, event_type, payload_json, occurred_at, recorded_at
         ) VALUES (@id, @eventKey, @settlementId, @type, @payloadJson, @occurredAt, @recordedAt)`,
      )
      .run({
        ...value,
        payloadJson,
        occurredAt: value.occurredAt.toISOString(),
        recordedAt: value.recordedAt.toISOString(),
      });
    if (result.changes > 0) return;

    const existing = this.db
      .prepare('SELECT * FROM qualification_recovery_settlement_events WHERE event_key = ?')
      .get(value.eventKey) as EventRow | undefined;
    if (
      !existing ||
      existing.settlement_id !== value.settlementId ||
      existing.event_type !== value.type ||
      existing.payload_json !== payloadJson ||
      existing.occurred_at !== value.occurredAt.toISOString()
    ) {
      throw new Error(
        `Qualification recovery settlement event key ${value.eventKey} was reused with different evidence`,
      );
    }
  }

  findByDecisionId(decisionId: string): QualificationRecoverySettlementRecord | null {
    const row = this.db
      .prepare('SELECT * FROM qualification_recovery_settlement_requests WHERE decision_id = ?')
      .get(decisionId) as RequestRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  findByCaseIds(caseIds: readonly string[]): Map<string, QualificationRecoverySettlementRecord[]> {
    const result = new Map<string, QualificationRecoverySettlementRecord[]>(caseIds.map((caseId) => [caseId, []]));
    if (caseIds.length === 0) return result;
    const placeholders = caseIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT * FROM qualification_recovery_settlement_requests
         WHERE case_id IN (${placeholders}) ORDER BY requested_at, rowid`,
      )
      .all(...caseIds) as RequestRow[];
    for (const row of rows) result.get(row.case_id)?.push(this.toRecord(row));
    return result;
  }

  private findRequestByDecisionId(decisionId: string): QualificationRecoverySettlementRequest | null {
    const row = this.db
      .prepare('SELECT * FROM qualification_recovery_settlement_requests WHERE decision_id = ?')
      .get(decisionId) as RequestRow | undefined;
    return row ? toRequest(row) : null;
  }

  private toRecord(row: RequestRow): QualificationRecoverySettlementRecord {
    const events = this.db
      .prepare(
        `SELECT * FROM qualification_recovery_settlement_events
         WHERE settlement_id = ? ORDER BY recorded_at, rowid`,
      )
      .all(row.settlement_id) as EventRow[];
    return createQualificationRecoverySettlementRecord(toRequest(row), events.map(toEvent));
  }
}

function toRequest(row: RequestRow): QualificationRecoverySettlementRequest {
  return createQualificationRecoverySettlementRequest({
    settlementId: row.settlement_id,
    caseId: row.case_id,
    decisionId: row.decision_id,
    competitionId: row.competition_id,
    laneId: row.lane_id,
    treatment: row.treatment,
    stageIndex: row.stage_index,
    seriesIndex: row.series_index,
    expectedMatchProgramId: row.expected_match_program_id,
    expectedSeriesShotLimit: row.expected_series_shot_limit,
    expectedRecordedShots: row.expected_recorded_shots,
    decisionOfficialName: row.decision_official_name,
    decisionRuleReference: row.decision_rule_reference,
    decidedAt: new Date(row.decided_at),
    appliedBy: row.applied_by,
    statement: row.statement,
    appliedAt: new Date(row.applied_at),
    requestedAt: new Date(row.requested_at),
  });
}

function toEvent(row: EventRow): QualificationRecoverySettlementEvent {
  return createQualificationRecoverySettlementEvent({
    id: row.id,
    eventKey: row.event_key,
    settlementId: row.settlement_id,
    type: row.event_type,
    payload: JSON.parse(row.payload_json) as QualificationRecoverySettlementEventPayload,
    occurredAt: new Date(row.occurred_at),
    recordedAt: new Date(row.recorded_at),
  });
}

function serializeRequest(request: QualificationRecoverySettlementRequest) {
  return {
    ...request,
    decidedAt: request.decidedAt.toISOString(),
    appliedAt: request.appliedAt.toISOString(),
    requestedAt: request.requestedAt.toISOString(),
  };
}

function sameBinding(
  left: QualificationRecoverySettlementRequest,
  right: QualificationRecoverySettlementRequest,
): boolean {
  const { settlementId: _leftId, requestedAt: _leftRequestedAt, ...leftBinding } = serializeRequest(left);
  const { settlementId: _rightId, requestedAt: _rightRequestedAt, ...rightBinding } = serializeRequest(right);
  return JSON.stringify(leftBinding) === JSON.stringify(rightBinding);
}
