// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import { SqliteSessionRepository } from '@/main/modules/session/infra/SqliteSessionRepository';
import { ShotObservation, createShotObservationOutcome } from '@/main/modules/shot-observation/domain/ShotObservation';
import { createShotObservationEvidence } from '@/main/modules/shot-observation/domain/ShotObservationEvidence';
import { SqliteShotObservationRepository } from '@/main/modules/shot-observation/infra/SqliteShotObservationRepository';
import { migration021 } from '@/main/shared-infra/sqlite/migrations/021_shot_competition_context';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

describe('shot competition context migration', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createSqliteDb(':memory:');
  });
  afterEach(() => db.close());

  it('recovers exact stored observation coordinates and leaves absent or contradictory evidence unresolved', async () => {
    const sessions = new SqliteSessionRepository(db);
    const observations = new SqliteShotObservationRepository(db);
    let session = Session.create(Discipline.airRifle10m());
    const observation = ShotObservation.create({ x: null, y: null, firedAt: new Date(), receivedAt: new Date() });
    await observations.append(observation);
    session = session.recordShot(null, new Score(100), new Date(), undefined, false, Mode.match(), {
      sourceObservationId: observation.id,
    });
    session = session.recordShot(null, new Score(100), new Date(), undefined, false, Mode.match());
    await sessions.save(session);
    const addEvidence = async (seriesIndex: number) => {
      const outcome = createShotObservationOutcome({
        observationId: observation.id,
        type: 'RECORDED',
        sessionId: session.id,
      });
      await observations.appendOutcomeWithEvidence(
        outcome,
        createShotObservationEvidence(observation, outcome, {
          competitionId: 'competition',
          stageIndex: 1,
          seriesIndex,
          phase: 'ACTIVE',
          stageScored: true,
        }),
      );
    };
    await addEvidence(1);
    db.exec('ALTER TABLE shots DROP COLUMN competitionContext');
    migration021.up(db);
    const reloaded = await new SqliteSessionRepository(db).findById(session.id);
    expect(reloaded!.allShots[0]!.competitionContext).toEqual({
      competitionId: 'competition',
      stageIndex: 1,
      seriesIndex: 1,
    });
    expect(reloaded!.allShots[1]!.competitionContext).toBeUndefined();
    await addEvidence(2);
    db.exec('UPDATE shots SET competitionContext = NULL');
    migration021.up(db);
    expect(
      (await new SqliteSessionRepository(db).findById(session.id))!.allShots[0]!.competitionContext,
    ).toBeUndefined();
  });

  it('preserves explicit placement on bulk save and refuses invalid persisted coordinates', async () => {
    const sessions = new SqliteSessionRepository(db);
    const session = Session.create(Discipline.airRifle10m()).recordShot(
      null,
      new Score(100),
      new Date(),
      undefined,
      false,
      Mode.match(),
      {
        competitionContext: { competitionId: 'competition', stageIndex: 2, seriesIndex: 3 },
      },
    );
    await sessions.save(session);
    expect((await sessions.findById(session.id))!.allShots[0]!.competitionContext).toEqual({
      competitionId: 'competition',
      stageIndex: 2,
      seriesIndex: 3,
    });
    db.prepare('UPDATE shots SET competitionContext = ?').run(
      JSON.stringify({ competitionId: 'competition', stageIndex: -1, seriesIndex: 0 }),
    );
    await expect(sessions.findById(session.id)).rejects.toThrow();
  });
});
