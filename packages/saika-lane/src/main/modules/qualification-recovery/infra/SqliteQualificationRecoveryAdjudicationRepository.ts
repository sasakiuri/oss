// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import {
  isScoringGaugeProfileId,
  isTargetScoringProfileId,
  type ScoringGaugeProfileId,
  type TargetScoringProfileId,
} from '@/shared/target';

import type { IQualificationRecoveryAdjudicationRepository } from '../domain/IQualificationRecoveryAdjudicationRepository';
import {
  createQualificationRecoveryAdjudication,
  type QualificationRecoveryAdjudicationRecord,
  type QualificationRecoveryAdjudicationShotDisposition,
  type QualificationRecoveryAdjudicationTreatment,
} from '../domain/QualificationRecoveryAdjudication';

interface AdjudicationRow {
  id: string;
  run_id: string;
  competition_id: string;
  session_id: string;
  decision_id: string;
  interruption_id: string;
  treatment: QualificationRecoveryAdjudicationTreatment;
  stage_index: number;
  series_index: number;
  session_series_number: number;
  expected_recorded_shots: number;
  authorized_shots: number;
  decision_official_name: string;
  decision_rule_reference: string;
  decided_at: string;
  applied_by: string;
  statement: string;
  applied_at: string;
}

interface AdjudicationShotRow {
  disposition: QualificationRecoveryAdjudicationShotDisposition;
  shot_snapshot_json: string;
}

interface ShotSnapshot {
  id: string;
  impactPoint: { x: number; y: number } | null;
  score: number;
  mode: 'SIGHTING' | 'MATCH';
  timestamp: string;
  shotNumber: number;
  seriesNumber: number;
  innerTen: boolean;
  deviceScore: number | null;
  calculatedScore: number;
  receivedAt: string;
  sourceObservationId: string | null;
  targetProfileId: string | null;
  scoringGaugeProfileId: string | null;
}

export class SqliteQualificationRecoveryAdjudicationRepository implements IQualificationRecoveryAdjudicationRepository {
  constructor(private readonly db: Database.Database) {}

  append(adjudication: QualificationRecoveryAdjudicationRecord): QualificationRecoveryAdjudicationRecord {
    const validated = createQualificationRecoveryAdjudication(adjudication);
    return this.db.transaction(() => {
      const existing = this.findByRunId(validated.runId);
      if (existing) {
        if (JSON.stringify(serializeRecord(existing)) !== JSON.stringify(serializeRecord(validated))) {
          throw new Error(`Qualification recovery run ${validated.runId} has a different adjudication`);
        }
        return existing;
      }

      this.db
        .prepare(
          `INSERT INTO qualification_recovery_adjudications (
             id, run_id, competition_id, session_id, decision_id, interruption_id, treatment,
             stage_index, series_index, session_series_number, expected_recorded_shots, authorized_shots,
             decision_official_name, decision_rule_reference, decided_at, applied_by, statement, applied_at
           ) VALUES (
             @id, @runId, @competitionId, @sessionId, @decisionId, @interruptionId, @treatment,
             @stageIndex, @seriesIndex, @sessionSeriesNumber, @expectedRecordedShots, @authorizedShots,
             @decisionOfficialName, @decisionRuleReference, @decidedAt, @appliedBy, @statement, @appliedAt
           )`,
        )
        .run({
          ...validated,
          decidedAt: validated.decidedAt.toISOString(),
          appliedAt: validated.appliedAt.toISOString(),
        });

      const insertEvidence = this.db.prepare(
        `INSERT INTO qualification_recovery_adjudication_shots (
           adjudication_id, shot_id, disposition, shot_snapshot_json
         ) VALUES (?, ?, ?, ?)`,
      );
      const insertCreditedShot = this.db.prepare(
        `INSERT INTO shots (
           id, sessionId, shotNumber, seriesNumber, impactPointX, impactPointY, score, innerTen,
           timestamp, mode, deviceScore, calculatedScore, receivedAt, observationId, targetProfileId,
           scoringGaugeProfileId
         ) VALUES (
           @id, @sessionId, @shotNumber, @seriesNumber, @impactPointX, @impactPointY, @score, @innerTen,
           @timestamp, @mode, @deviceScore, @calculatedScore, @receivedAt, @observationId, @targetProfileId,
           @scoringGaugeProfileId
         )`,
      );
      const alignPreservedOriginal = this.db.prepare(
        'UPDATE shots SET seriesNumber = ? WHERE id = ? AND sessionId = ?',
      );

      for (const entry of validated.shots) {
        insertEvidence.run(validated.id, entry.shot.id, entry.disposition, JSON.stringify(serializeShot(entry.shot)));
        if (entry.disposition === 'PRESERVED_ORIGINAL') {
          const result = alignPreservedOriginal.run(validated.sessionSeriesNumber, entry.shot.id, validated.sessionId);
          if (result.changes !== 1) throw new Error(`Original shot ${entry.shot.id} is unavailable for adjudication`);
        }
        if (entry.disposition === 'ANNULLED_ORIGINAL') {
          const found = this.db
            .prepare('SELECT 1 FROM shots WHERE id = ? AND sessionId = ?')
            .get(entry.shot.id, validated.sessionId);
          if (!found) throw new Error(`Original shot ${entry.shot.id} is unavailable for adjudication`);
        }
        if (entry.disposition === 'CREDITED_RECOVERY' || entry.disposition === 'CREDITED_MISS') {
          insertCreditedShot.run(toShotRow(validated.sessionId, entry.shot));
        }
      }

      return this.requireByRunId(validated.runId);
    })();
  }

  findByRunId(runId: string): QualificationRecoveryAdjudicationRecord | null {
    const row = this.db.prepare('SELECT * FROM qualification_recovery_adjudications WHERE run_id = ?').get(runId) as
      AdjudicationRow | undefined;
    if (!row) return null;
    const shotRows = this.db
      .prepare(
        `SELECT disposition, shot_snapshot_json
         FROM qualification_recovery_adjudication_shots
         WHERE adjudication_id = ? ORDER BY rowid`,
      )
      .all(row.id) as AdjudicationShotRow[];
    return createQualificationRecoveryAdjudication({
      id: row.id,
      runId: row.run_id,
      competitionId: row.competition_id,
      sessionId: row.session_id,
      decisionId: row.decision_id,
      interruptionId: row.interruption_id,
      treatment: row.treatment,
      stageIndex: row.stage_index,
      seriesIndex: row.series_index,
      sessionSeriesNumber: row.session_series_number,
      expectedRecordedShots: row.expected_recorded_shots,
      authorizedShots: row.authorized_shots,
      decisionOfficialName: row.decision_official_name,
      decisionRuleReference: row.decision_rule_reference,
      decidedAt: new Date(row.decided_at),
      appliedBy: row.applied_by,
      statement: row.statement,
      appliedAt: new Date(row.applied_at),
      shots: shotRows.map((shotRow) => ({
        disposition: shotRow.disposition,
        shot: deserializeShot(JSON.parse(shotRow.shot_snapshot_json) as ShotSnapshot),
      })),
    });
  }

  private requireByRunId(runId: string): QualificationRecoveryAdjudicationRecord {
    const record = this.findByRunId(runId);
    if (!record) throw new Error(`Qualification recovery adjudication ${runId} was not persisted`);
    return record;
  }
}

function serializeRecord(record: QualificationRecoveryAdjudicationRecord) {
  return {
    ...record,
    decidedAt: record.decidedAt.toISOString(),
    appliedAt: record.appliedAt.toISOString(),
    shots: record.shots.map((entry) => ({ disposition: entry.disposition, shot: serializeShot(entry.shot) })),
  };
}

function serializeShot(shot: Shot): ShotSnapshot {
  return {
    id: shot.id,
    impactPoint: shot.impactPoint ? { x: shot.impactPoint.x, y: shot.impactPoint.y } : null,
    score: shot.score.value,
    mode: shot.mode.value,
    timestamp: shot.timestamp.toISOString(),
    shotNumber: shot.shotNumber,
    seriesNumber: shot.seriesNumber,
    innerTen: shot.innerTen,
    deviceScore: shot.deviceScore?.value ?? null,
    calculatedScore: shot.calculatedScore.value,
    receivedAt: shot.receivedAt.toISOString(),
    sourceObservationId: shot.sourceObservationId ?? null,
    targetProfileId: shot.targetProfileId ?? null,
    scoringGaugeProfileId: shot.scoringGaugeProfileId ?? null,
  };
}

function deserializeShot(snapshot: ShotSnapshot): Shot {
  return Shot.reconstruct({
    id: snapshot.id,
    impactPoint: snapshot.impactPoint ? new ImpactPoint(snapshot.impactPoint.x, snapshot.impactPoint.y) : null,
    score: new Score(snapshot.score),
    mode: Mode.fromValue(snapshot.mode),
    timestamp: new Date(snapshot.timestamp),
    shotNumber: snapshot.shotNumber,
    seriesNumber: snapshot.seriesNumber,
    innerTen: snapshot.innerTen,
    ...(snapshot.deviceScore !== null ? { deviceScore: new Score(snapshot.deviceScore) } : {}),
    calculatedScore: new Score(snapshot.calculatedScore),
    receivedAt: new Date(snapshot.receivedAt),
    ...(snapshot.sourceObservationId ? { sourceObservationId: snapshot.sourceObservationId } : {}),
    ...(parseTargetProfileId(snapshot.targetProfileId)
      ? { targetProfileId: parseTargetProfileId(snapshot.targetProfileId) }
      : {}),
    ...(parseScoringGaugeProfileId(snapshot.scoringGaugeProfileId)
      ? { scoringGaugeProfileId: parseScoringGaugeProfileId(snapshot.scoringGaugeProfileId) }
      : {}),
  });
}

function toShotRow(sessionId: string, shot: Shot) {
  return {
    id: shot.id,
    sessionId,
    shotNumber: shot.shotNumber,
    seriesNumber: shot.seriesNumber,
    impactPointX: shot.impactPoint?.x ?? null,
    impactPointY: shot.impactPoint?.y ?? null,
    score: shot.score.value,
    innerTen: shot.innerTen ? 1 : 0,
    timestamp: shot.timestamp.toISOString(),
    mode: shot.mode.value,
    deviceScore: shot.deviceScore?.value ?? null,
    calculatedScore: shot.calculatedScore.value,
    receivedAt: shot.receivedAt.toISOString(),
    observationId: shot.sourceObservationId ?? null,
    targetProfileId: shot.targetProfileId ?? null,
    scoringGaugeProfileId: shot.scoringGaugeProfileId ?? null,
  };
}

function parseTargetProfileId(value: string | null): TargetScoringProfileId | undefined {
  if (value === null) return undefined;
  if (!isTargetScoringProfileId(value)) throw new Error(`Unknown target scoring profile: ${value}`);
  return value;
}

function parseScoringGaugeProfileId(value: string | null): ScoringGaugeProfileId | undefined {
  if (value === null) return undefined;
  if (!isScoringGaugeProfileId(value)) throw new Error(`Unknown scoring gauge profile: ${value}`);
  return value;
}
