import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createQualificationRecoveryAdjudication,
  SqliteQualificationRecoveryAdjudicationRepository,
} from '@/main/modules/qualification-recovery';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import { Shot } from '@/main/modules/session/domain/Shot';
import { SqliteSessionRepository } from '@/main/modules/session/infra/SqliteSessionRepository';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

describe('SqliteQualificationRecoveryAdjudicationRepository', () => {
  let db: Database.Database;
  let sessionRepository: SqliteSessionRepository;
  let repository: SqliteQualificationRecoveryAdjudicationRepository;

  beforeEach(() => {
    db = createSqliteDb(':memory:');
    sessionRepository = new SqliteSessionRepository(db);
    repository = new SqliteQualificationRecoveryAdjudicationRepository(db);
  });

  afterEach(() => db.close());

  it('keeps annulled evidence while projecting only the repeated series into Session score', async () => {
    let session = Session.create(Discipline.pistol25m(), 'RING');
    session = session.recordShot(
      new ImpactPoint(1, 1),
      new Score(90),
      new Date('2026-09-03T01:00:01Z'),
      undefined,
      false,
      Mode.match(),
    );
    session = session.recordShot(
      new ImpactPoint(2, 1),
      new Score(80),
      new Date('2026-09-03T01:00:02Z'),
      undefined,
      false,
      Mode.match(),
    );
    await sessionRepository.save(session);

    const repeated = Array.from({ length: 5 }, (_, index) => creditedShot(index + 1, 95 - index * 10));
    const adjudication = repository.append(
      createQualificationRecoveryAdjudication({
        id: 'adjudication-1',
        runId: 'run-1',
        competitionId: 'competition-1',
        sessionId: session.id,
        decisionId: 'decision-1',
        interruptionId: 'interruption-1',
        treatment: 'ANNUL_AND_REPEAT',
        stageIndex: 1,
        seriesIndex: 0,
        sessionSeriesNumber: 1,
        expectedRecordedShots: 2,
        authorizedShots: 5,
        decisionOfficialName: 'Jury Member A',
        decisionRuleReference: '8.8.1(b)',
        decidedAt: new Date('2026-09-03T01:01:00Z'),
        appliedBy: 'Range Officer B',
        statement: 'Repeated series checked and credited.',
        appliedAt: new Date('2026-09-03T01:03:00Z'),
        shots: [
          ...session.matchShots.map((shot) => ({ disposition: 'ANNULLED_ORIGINAL' as const, shot })),
          ...repeated.map((shot, index) => ({
            disposition: index === 4 ? ('CREDITED_MISS' as const) : ('CREDITED_RECOVERY' as const),
            shot,
          })),
        ],
      }),
    );

    expect(adjudication.shots).toHaveLength(7);
    const projected = await sessionRepository.findById(session.id);
    expect(projected?.matchShots.map((shot) => shot.score.value)).toEqual([95, 85, 75, 65, 55]);
    expect(projected?.matchShots.map((shot) => shot.shotNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM shots WHERE sessionId = ?').get(session.id)).toEqual({ count: 7 });

    await sessionRepository.save(projected!);
    expect(db.prepare('SELECT COUNT(*) AS count FROM shots WHERE sessionId = ?').get(session.id)).toEqual({ count: 7 });
    expect(repository.findByRunId('run-1')).toMatchObject({
      treatment: 'ANNUL_AND_REPEAT',
      appliedBy: 'Range Officer B',
    });
  });

  it('makes the adjudication and its shot evidence immutable', async () => {
    let session = Session.create(Discipline.pistol25m(), 'RING');
    session = session.recordShot(null, Score.miss(), new Date('2026-09-03T01:00:01Z'), undefined, false, Mode.match());
    await sessionRepository.save(session);
    repository.append(
      createQualificationRecoveryAdjudication({
        id: 'adjudication-2',
        runId: 'run-2',
        competitionId: 'competition-2',
        sessionId: session.id,
        decisionId: 'decision-2',
        interruptionId: 'interruption-2',
        treatment: 'COMPLETE_REMAINING_SHOTS',
        stageIndex: 1,
        seriesIndex: 0,
        sessionSeriesNumber: 1,
        expectedRecordedShots: 1,
        authorizedShots: 1,
        decisionOfficialName: 'Jury Member A',
        decisionRuleReference: '8.8.1(c-d)',
        decidedAt: new Date('2026-09-03T01:01:00Z'),
        appliedBy: 'Range Officer B',
        statement: 'Completion shot credited.',
        appliedAt: new Date('2026-09-03T01:03:00Z'),
        shots: [
          { disposition: 'PRESERVED_ORIGINAL', shot: session.matchShots[0]! },
          { disposition: 'CREDITED_RECOVERY', shot: creditedShot(2, 90) },
        ],
      }),
    );

    expect(() => db.prepare("UPDATE qualification_recovery_adjudications SET applied_by = 'Changed'").run()).toThrow(
      'immutable',
    );
    expect(() => db.prepare('DELETE FROM qualification_recovery_adjudication_shots').run()).toThrow('append-only');
  });
});

function creditedShot(shotNumber: number, score: number): Shot {
  return Shot.reconstruct({
    id: `00000000-0000-4000-8000-${String(shotNumber).padStart(12, '0')}`,
    impactPoint: score > 0 ? new ImpactPoint(1, -1) : null,
    score: new Score(score),
    mode: Mode.match(),
    timestamp: new Date(`2026-09-03T01:02:0${shotNumber}Z`),
    shotNumber,
    seriesNumber: 1,
    innerTen: false,
    calculatedScore: new Score(score),
    receivedAt: new Date(`2026-09-03T01:02:0${shotNumber}.010Z`),
    targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
    scoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
  });
}
