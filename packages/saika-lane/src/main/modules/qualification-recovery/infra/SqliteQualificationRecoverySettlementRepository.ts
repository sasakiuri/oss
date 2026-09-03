// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

import type { IQualificationRecoverySettlementRepository } from '../domain/IQualificationRecoverySettlementRepository';
import {
  createQualificationRecoverySettlement,
  type QualificationRecoverySettlementRecord,
  type QualificationRecoverySettlementShotEvidence,
} from '../domain/QualificationRecoverySettlement';

interface SettlementRow {
  id: string;
  decision_id: string;
  competition_id: string;
  session_id: string;
  interruption_id: string;
  treatment: 'KEEP_RECORDED_SERIES';
  stage_index: number;
  series_index: number;
  session_series_number: number;
  expected_match_program_id: string;
  expected_series_shot_limit: number;
  expected_recorded_shots: number;
  decision_official_name: string;
  decision_rule_reference: string;
  decided_at: string;
  applied_by: string;
  statement: string;
  applied_at: string;
  recorded_shots_json: string;
}

export class SqliteQualificationRecoverySettlementRepository implements IQualificationRecoverySettlementRepository {
  constructor(private readonly db: Database.Database) {}

  append(settlement: QualificationRecoverySettlementRecord): QualificationRecoverySettlementRecord {
    const value = createQualificationRecoverySettlement(settlement);
    const serialized = serialize(value);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO qualification_recovery_settlements (
           id, decision_id, competition_id, session_id, interruption_id, treatment,
           stage_index, series_index, session_series_number, expected_match_program_id,
           expected_series_shot_limit, expected_recorded_shots, decision_official_name,
           decision_rule_reference, decided_at, applied_by, statement, applied_at,
           recorded_shots_json
         ) VALUES (
           @id, @decisionId, @competitionId, @sessionId, @interruptionId, @treatment,
           @stageIndex, @seriesIndex, @sessionSeriesNumber, @expectedMatchProgramId,
           @expectedSeriesShotLimit, @expectedRecordedShots, @decisionOfficialName,
           @decisionRuleReference, @decidedAt, @appliedBy, @statement, @appliedAt,
           @recordedShotsJson
         )`,
      )
      .run(serialized);

    const stored = this.findByDecisionId(value.decisionId);
    if (!stored) throw new Error(`Qualification recovery settlement ${value.decisionId} was not persisted`);
    if (!sameSettlement(stored, value)) {
      throw new Error(`Qualification recovery decision ${value.decisionId} has a different settlement`);
    }
    return stored;
  }

  findByDecisionId(decisionId: string): QualificationRecoverySettlementRecord | null {
    const row = this.db
      .prepare('SELECT * FROM qualification_recovery_settlements WHERE decision_id = ?')
      .get(decisionId) as SettlementRow | undefined;
    if (!row) return null;
    return createQualificationRecoverySettlement({
      id: row.id,
      decisionId: row.decision_id,
      competitionId: row.competition_id,
      sessionId: row.session_id,
      interruptionId: row.interruption_id,
      treatment: row.treatment,
      stageIndex: row.stage_index,
      seriesIndex: row.series_index,
      sessionSeriesNumber: row.session_series_number,
      expectedMatchProgramId: row.expected_match_program_id,
      expectedSeriesShotLimit: row.expected_series_shot_limit,
      expectedRecordedShots: row.expected_recorded_shots,
      decisionOfficialName: row.decision_official_name,
      decisionRuleReference: row.decision_rule_reference,
      decidedAt: new Date(row.decided_at),
      appliedBy: row.applied_by,
      statement: row.statement,
      appliedAt: new Date(row.applied_at),
      recordedShots: JSON.parse(row.recorded_shots_json) as QualificationRecoverySettlementShotEvidence[],
    });
  }
}

function serialize(record: QualificationRecoverySettlementRecord) {
  return {
    id: record.id,
    decisionId: record.decisionId,
    competitionId: record.competitionId,
    sessionId: record.sessionId,
    interruptionId: record.interruptionId,
    treatment: record.treatment,
    stageIndex: record.stageIndex,
    seriesIndex: record.seriesIndex,
    sessionSeriesNumber: record.sessionSeriesNumber,
    expectedMatchProgramId: record.expectedMatchProgramId,
    expectedSeriesShotLimit: record.expectedSeriesShotLimit,
    expectedRecordedShots: record.expectedRecordedShots,
    decisionOfficialName: record.decisionOfficialName,
    decisionRuleReference: record.decisionRuleReference,
    decidedAt: record.decidedAt.toISOString(),
    appliedBy: record.appliedBy,
    statement: record.statement,
    appliedAt: record.appliedAt.toISOString(),
    recordedShotsJson: JSON.stringify(record.recordedShots),
  };
}

function sameSettlement(
  left: QualificationRecoverySettlementRecord,
  right: QualificationRecoverySettlementRecord,
): boolean {
  const { id: _leftId, ...leftBinding } = serialize(left);
  const { id: _rightId, ...rightBinding } = serialize(right);
  return JSON.stringify(leftBinding) === JSON.stringify(rightBinding);
}
