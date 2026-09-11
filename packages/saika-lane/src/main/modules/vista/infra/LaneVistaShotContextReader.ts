// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

import { parseShotObservationEvidence } from '@/main/modules/shot-observation/domain/ShotObservationEvidence';

import type { LaneVistaShotContext } from '../application/LaneVistaProjection';

/** Reads the acquisition-time position, including series ended with fewer shots. */
export class LaneVistaShotContextReader {
  private readonly select: Database.Statement;
  private readonly selectShootOffs: Database.Statement;

  constructor(database: Database.Database) {
    this.select = database.prepare(`
      SELECT shots.id, evidence.payload_json
      FROM shots
      JOIN shot_observation_outcomes AS outcome ON outcome.observation_id = shots.observationId
      JOIN shot_observation_evidence_outbox AS evidence ON evidence.evidence_id = outcome.id
      WHERE shots.sessionId = ? AND outcome.outcome_type = 'RECORDED'
    `);
    this.selectShootOffs = database.prepare(`
      SELECT shoot_off.shot_id, shoot_off.iteration
      FROM competition_shoot_off_shot_outbox AS shoot_off
      JOIN shots ON shots.id = shoot_off.shot_id
      WHERE shoot_off.competition_id = ? AND shots.sessionId = ?
    `);
  }

  read(competitionId: string, sessionId: string): ReadonlyMap<string, LaneVistaShotContext> {
    const contexts = new Map<string, LaneVistaShotContext>();
    for (const row of this.select.all(sessionId) as Array<{ id: string; payload_json: string }>) {
      const evidence = parseShotObservationEvidence(row.payload_json);
      const position = evidence.competition;
      if (
        evidence.outcome === 'RECORDED' &&
        evidence.sessionId === sessionId &&
        position?.competitionId === competitionId &&
        Number.isSafeInteger(position.stageIndex) &&
        position.stageIndex >= 0 &&
        Number.isSafeInteger(position.seriesIndex) &&
        position.seriesIndex >= 0
      )
        contexts.set(row.id, { stage: position.stageIndex, series: position.seriesIndex });
    }
    return contexts;
  }

  readShootOffSeries(competitionId: string, sessionId: string): ReadonlyMap<string, number> {
    return new Map(
      (this.selectShootOffs.all(competitionId, sessionId) as Array<{ shot_id: string; iteration: number }>).map(
        (row) => [row.shot_id, row.iteration - 1],
      ),
    );
  }
}
