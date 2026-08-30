// SPDX-License-Identifier: MIT

import type Database from 'better-sqlite3';

import type { IShotObservationRepository } from '../domain/IShotObservationRepository';
import {
  ShotObservation,
  type ShotObservationOutcome,
  type ShotObservationOutcomeType,
} from '../domain/ShotObservation';
import { serializeShotObservationEvidence, type ShotObservationEvidence } from '../domain/ShotObservationEvidence';

interface ObservationRow {
  id: string;
  x: number | null;
  y: number | null;
  device_score_x10: number | null;
  fired_at: string;
  received_at: string;
  reported_mode: 'SIGHTING' | 'MATCH' | null;
  raw_frame_hex: string | null;
}

interface OutcomeRow {
  id: string;
  observation_id: string;
  outcome_type: ShotObservationOutcomeType;
  decided_at: string;
  session_id: string | null;
  detail: string | null;
}

export class SqliteShotObservationRepository implements IShotObservationRepository {
  private readonly insertObservation: Database.Statement;
  private readonly insertOutcome: Database.Statement;
  private readonly selectObservation: Database.Statement;
  private readonly selectOutcomes: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.insertObservation = db.prepare(`
      INSERT INTO shot_observations (
        id, x, y, device_score_x10, fired_at, received_at, reported_mode, raw_frame_hex
      ) VALUES (
        @id, @x, @y, @deviceScoreX10, @firedAt, @receivedAt, @reportedMode, @rawFrameHex
      )
    `);
    this.insertOutcome = db.prepare(`
      INSERT INTO shot_observation_outcomes (
        id, observation_id, outcome_type, decided_at, session_id, detail
      ) VALUES (
        @id, @observationId, @type, @decidedAt, @sessionId, @detail
      )
    `);
    this.selectObservation = db.prepare('SELECT * FROM shot_observations WHERE id = ?');
    this.selectOutcomes = db.prepare(
      'SELECT * FROM shot_observation_outcomes WHERE observation_id = ? ORDER BY decided_at, id',
    );
  }

  async append(observation: ShotObservation): Promise<void> {
    this.insertObservation.run({
      id: observation.id,
      x: observation.x,
      y: observation.y,
      deviceScoreX10: observation.deviceScoreX10,
      firedAt: observation.firedAt.toISOString(),
      receivedAt: observation.receivedAt.toISOString(),
      reportedMode: observation.reportedMode,
      rawFrameHex: observation.rawFrameHex,
    });
  }

  async appendOutcome(outcome: ShotObservationOutcome): Promise<void> {
    this.insertOutcome.run({
      id: outcome.id,
      observationId: outcome.observationId,
      type: outcome.type,
      decidedAt: outcome.decidedAt.toISOString(),
      sessionId: outcome.sessionId,
      detail: outcome.detail,
    });
  }

  async appendOutcomeWithEvidence(outcome: ShotObservationOutcome, evidence: ShotObservationEvidence): Promise<void> {
    if (evidence.outcomeId !== outcome.id || evidence.observationId !== outcome.observationId) {
      throw new Error('Outbound evidence does not match the observation outcome');
    }
    this.db.transaction(() => {
      this.insertOutcome.run({
        id: outcome.id,
        observationId: outcome.observationId,
        type: outcome.type,
        decidedAt: outcome.decidedAt.toISOString(),
        sessionId: outcome.sessionId,
        detail: outcome.detail,
      });
      this.db
        .prepare(
          `INSERT INTO shot_observation_evidence_outbox (
             evidence_id, observation_id, outcome_id, payload_json, created_at, published_at
           ) VALUES (?, ?, ?, ?, ?, NULL)`,
        )
        .run(
          evidence.evidenceId,
          evidence.observationId,
          evidence.outcomeId,
          serializeShotObservationEvidence(evidence),
          evidence.decidedAt.toISOString(),
        );
    })();
  }

  async findById(id: string): Promise<ShotObservation | null> {
    const row = this.selectObservation.get(id) as ObservationRow | undefined;
    if (!row) return null;
    return ShotObservation.reconstruct({
      id: row.id,
      x: row.x,
      y: row.y,
      deviceScoreX10: row.device_score_x10,
      firedAt: new Date(row.fired_at),
      receivedAt: new Date(row.received_at),
      reportedMode: row.reported_mode,
      rawFrameHex: row.raw_frame_hex,
    });
  }

  async findOutcomes(observationId: string): Promise<readonly ShotObservationOutcome[]> {
    return (this.selectOutcomes.all(observationId) as OutcomeRow[]).map((row) =>
      Object.freeze({
        id: row.id,
        observationId: row.observation_id,
        type: row.outcome_type,
        decidedAt: new Date(row.decided_at),
        sessionId: row.session_id,
        detail: row.detail,
      }),
    );
  }
}
