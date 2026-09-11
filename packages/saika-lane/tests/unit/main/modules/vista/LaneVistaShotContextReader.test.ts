// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { SqliteCompetitionShootOffShotOutbox } from '@/main/modules/competition-shoot-off';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import { SqliteSessionRepository } from '@/main/modules/session/infra/SqliteSessionRepository';
import { ShotObservation, createShotObservationOutcome } from '@/main/modules/shot-observation/domain/ShotObservation';
import { createShotObservationEvidence } from '@/main/modules/shot-observation/domain/ShotObservationEvidence';
import { SqliteShotObservationEvidenceOutbox } from '@/main/modules/shot-observation/infra/SqliteShotObservationEvidenceOutbox';
import { SqliteShotObservationRepository } from '@/main/modules/shot-observation/infra/SqliteShotObservationRepository';
import { LaneVistaShotContextReader } from '@/main/modules/vista/infra/LaneVistaShotContextReader';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

describe('Lane Vista acquisition positions', () => {
  it('reads published shoot-off membership without confusing competitions or sessions', async () => {
    const database = createSqliteDb(':memory:');
    try {
      const session = Session.create(Discipline.airRifle10m()).recordShot(null, new Score(109), new Date());
      await new SqliteSessionRepository(database).save(session);
      const competitionId = crypto.randomUUID();
      const shotId = session.allShots[0]!.id;
      const outbox = new SqliteCompetitionShootOffShotOutbox(database);
      const at = new Date().toISOString();
      outbox.enqueue({
        schemaVersion: 1,
        competitionId,
        runId: crypto.randomUUID(),
        iteration: 2,
        laneId: crypto.randomUUID(),
        shotId,
        x: null,
        y: null,
        effectiveScoreX10: 109,
        deviceScoreX10: 109,
        calculatedScoreX10: 109,
        innerTen: true,
        firedAt: at,
        receivedAt: at,
        publishedAt: at,
      });
      outbox.markPublished(shotId, new Date());
      const reader = new LaneVistaShotContextReader(database);
      expect([...reader.readShootOffSeries(competitionId, session.id)]).toEqual([[shotId, 1]]);
      expect(reader.readShootOffSeries(competitionId, 'other-session').size).toBe(0);
      expect(reader.readShootOffSeries('other-competition', session.id).size).toBe(0);
    } finally {
      database.close();
    }
  });

  it('reads exact positions from published evidence and isolates competition and session identity', async () => {
    const database = createSqliteDb(':memory:');
    try {
      const observations = new SqliteShotObservationRepository(database);
      const sessions = new SqliteSessionRepository(database);
      const reader = new LaneVistaShotContextReader(database);
      const observation = ShotObservation.create({
        x: null,
        y: null,
        firedAt: new Date(),
        receivedAt: new Date(),
        timestampSource: 'LANE_RECEIPT',
      });
      await observations.append(observation);
      const session = Session.create(Discipline.airRifle10m()).recordShot(
        null,
        new Score(0),
        new Date(),
        undefined,
        false,
        Mode.match(),
        { sourceObservationId: observation.id },
      );
      await sessions.save(session);
      // Shot persistence precedes observation finalization during ingestion.
      expect(reader.read('final', session.id).size).toBe(0);
      const outcome = createShotObservationOutcome({
        observationId: observation.id,
        type: 'RECORDED',
        sessionId: session.id,
      });
      const evidence = createShotObservationEvidence(observation, outcome, {
        competitionId: 'final',
        phase: 'ACTIVE',
        stageIndex: 2,
        seriesIndex: 8,
        stageScored: true,
      });
      await observations.appendOutcomeWithEvidence(outcome, evidence);
      await new SqliteShotObservationEvidenceOutbox(database).markPublished(evidence.evidenceId, new Date());
      expect(reader.read('final', session.id).get(session.allShots[0]!.id)).toEqual({ stage: 2, series: 8 });
      expect(reader.read('other-competition', session.id).size).toBe(0);
      expect(reader.read('final', 'other-session').size).toBe(0);
    } finally {
      database.close();
    }
  });
});
