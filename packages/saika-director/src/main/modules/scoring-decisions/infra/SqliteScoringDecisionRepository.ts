import type Database from 'better-sqlite3';

import type { IScoringDecisionRepository } from '../domain/IScoringDecisionRepository';
import {
  ScoringDecision,
  type ScoringApplicationPolicy,
  type ScoringClassificationCode,
  type ScoringDecisionType,
  type ScoringResultScope,
} from '../domain/ScoringDecision';

interface ScoringDecisionRow {
  id: string;
  event_id: string;
  participant_id: string;
  relay_number: number;
  result_scope: ScoringResultScope;
  result_id_at_decision: string;
  source_competition_id: string | null;
  decision_type: ScoringDecisionType;
  application_policy: ScoringApplicationPolicy;
  points_x10: number | null;
  series_index: number | null;
  shot_index: number | null;
  classification_code: ScoringClassificationCode | null;
  rule_reference: string;
  incident_report_number: string | null;
  public_remark: string;
  internal_note: string | null;
  official_name: string;
  decided_at: string;
  reverses_decision_id: string | null;
}

export class SqliteScoringDecisionRepository implements IScoringDecisionRepository {
  constructor(private readonly db: Database.Database) {}

  append(decision: ScoringDecision): void {
    this.db
      .prepare(
        `INSERT INTO scoring_decisions (
           id, event_id, participant_id, relay_number, result_scope, result_id_at_decision,
           source_competition_id, decision_type, application_policy, points_x10,
           series_index, shot_index, classification_code, rule_reference,
           incident_report_number, public_remark, internal_note, official_name,
           decided_at, reverses_decision_id
         ) VALUES (
           @id, @eventId, @participantId, @relayNumber, @resultScope, @resultIdAtDecision,
           @sourceCompetitionId, @type, @applicationPolicy, @pointsX10,
           @seriesIndex, @shotIndex, @classificationCode, @ruleReference,
           @incidentReportNumber, @publicRemark, @internalNote, @officialName,
           @decidedAt, @reversesDecisionId
         )`,
      )
      .run({ ...decision, decidedAt: decision.decidedAt.toISOString() });
  }

  findById(id: string): ScoringDecision | null {
    const row = this.db.prepare('SELECT * FROM scoring_decisions WHERE id = ?').get(id) as
      ScoringDecisionRow | undefined;
    return row ? toDomain(row) : null;
  }

  findByTarget(
    eventId: string,
    participantId: string,
    relayNumber: number,
    resultScope: ScoringResultScope,
  ): ScoringDecision[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM scoring_decisions
         WHERE event_id = ? AND participant_id = ? AND relay_number = ? AND result_scope = ?
         ORDER BY decided_at, id`,
      )
      .all(eventId, participantId, relayNumber, resultScope) as ScoringDecisionRow[];
    return rows.map(toDomain);
  }

  findByEventId(eventId: string, resultScope: ScoringResultScope): ScoringDecision[] {
    const rows = this.db
      .prepare('SELECT * FROM scoring_decisions WHERE event_id = ? AND result_scope = ? ORDER BY decided_at, id')
      .all(eventId, resultScope) as ScoringDecisionRow[];
    return rows.map(toDomain);
  }
}

function toDomain(row: ScoringDecisionRow): ScoringDecision {
  return ScoringDecision.reconstruct({
    id: row.id,
    eventId: row.event_id,
    participantId: row.participant_id,
    relayNumber: row.relay_number,
    resultScope: row.result_scope,
    resultIdAtDecision: row.result_id_at_decision,
    sourceCompetitionId: row.source_competition_id,
    type: row.decision_type,
    applicationPolicy: row.application_policy,
    pointsX10: row.points_x10,
    seriesIndex: row.series_index,
    shotIndex: row.shot_index,
    classificationCode: row.classification_code,
    ruleReference: row.rule_reference,
    incidentReportNumber: row.incident_report_number,
    publicRemark: row.public_remark,
    internalNote: row.internal_note,
    officialName: row.official_name,
    decidedAt: new Date(row.decided_at),
    reversesDecisionId: row.reverses_decision_id,
  });
}
