import type Database from 'better-sqlite3';

import { ShotObservationEvidencePayloadSchema } from '@/shared/mqtt';

import type {
  IShotObservationEvidenceJournal,
  ShotObservationEvidenceRecord,
} from '../domain/IShotObservationEvidenceJournal';

interface EvidenceRow {
  observed_at: string;
  payload_json: string;
}

export class SqliteShotObservationEvidenceJournal implements IShotObservationEvidenceJournal {
  constructor(private readonly db: Database.Database) {}

  append(record: ShotObservationEvidenceRecord): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO mqtt_shot_observation_evidence (
           evidence_id, observation_id, competition_id, lane_id, outcome,
           fired_at, received_at, observed_at, payload_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.evidence.evidenceId,
        record.evidence.observationId,
        record.evidence.competition?.competitionId ?? null,
        record.evidence.laneId,
        record.evidence.outcome,
        record.evidence.firedAt,
        record.evidence.receivedAt,
        record.observedAt.toISOString(),
        record.payloadJson,
      );
  }

  findByCompetition(competitionId: string): ShotObservationEvidenceRecord[] {
    const rows = this.db
      .prepare(
        `SELECT observed_at, payload_json FROM mqtt_shot_observation_evidence
         WHERE competition_id = ?
         ORDER BY observed_at, rowid`,
      )
      .all(competitionId) as EvidenceRow[];
    return rows.map((row) => ({
      evidence: ShotObservationEvidencePayloadSchema.parse(JSON.parse(row.payload_json)),
      observedAt: new Date(row.observed_at),
      payloadJson: row.payload_json,
    }));
  }
}
