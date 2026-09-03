// SPDX-License-Identifier: MIT
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { P25 } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { LaneInterruptionRecord } from '@/main/modules/competition-interruption';
import {
  createQualificationRecoverySettlement,
  QualificationRecoverySettlementService,
  SqliteQualificationRecoverySettlementRepository,
  type QualificationRecoveryRunRecord,
} from '@/main/modules/qualification-recovery';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import { SqliteSessionRepository } from '@/main/modules/session/infra/SqliteSessionRepository';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

const DECISION_ID = '11111111-1111-4111-8111-111111111111';
const INTERRUPTION_ID = '22222222-2222-4222-8222-222222222222';
const COMPETITION_ID = '33333333-3333-4333-8333-333333333333';
const APPLIED_AT = new Date('2026-09-04T01:10:00.000Z');

describe('QualificationRecoverySettlementService', () => {
  let db: Database.Database;
  let competition: CompetitionState;
  let interruption: LaneInterruptionRecord | null;
  let service: QualificationRecoverySettlementService;
  let competitionRepository: ICompetitionRepository;
  let sessionRepository: SqliteSessionRepository;

  beforeEach(async () => {
    db = createSqliteDb(':memory:');
    sessionRepository = new SqliteSessionRepository(db);
    let session = Session.create(Discipline.pistol25m(), 'RING');
    for (let index = 0; index < 5; index += 1) {
      session = session.recordShot(
        new ImpactPoint(index + 1, 1),
        new Score(100 - index),
        new Date(`2026-09-04T01:00:0${index + 1}.000Z`),
        undefined,
        index === 0,
        Mode.match(),
      );
    }
    await sessionRepository.save(session);

    competition = CompetitionState.create(COMPETITION_ID, session.id, P25.config)
      .startStage()
      .expireTimer()
      .advanceToNextStage()
      .startNextSeries();
    for (let index = 0; index < 5; index += 1) competition = competition.recordShotInSeries();
    competitionRepository = {
      save: vi.fn(async (state: CompetitionState) => {
        competition = state;
      }),
      findById: vi.fn(async (id: string) => (id === competition.id ? competition : null)),
      findBySessionId: vi.fn(),
      findActive: vi.fn(async () => competition),
      delete: vi.fn(),
    };
    interruption = LaneInterruptionRecord.create({
      competitionId: COMPETITION_ID,
      interruptionId: INTERRUPTION_ID,
      status: 'PAUSED',
      pausedAt: new Date('2026-09-04T01:05:00.000Z'),
      capturedAt: new Date('2026-09-04T01:05:00.010Z'),
      capturedRemainingSeconds: 0,
      capturedTotalSeconds: 0,
    });
    service = createService(() => null);
  });

  afterEach(() => db.close());

  it('retains immutable full-series evidence and clears the paused interruption without changing score rows', async () => {
    const before = db.prepare('SELECT id, score FROM shots ORDER BY shotNumber').all();
    const settlement = await service.apply(input());

    expect(settlement).toMatchObject({
      decisionId: DECISION_ID,
      treatment: 'KEEP_RECORDED_SERIES',
      expectedRecordedShots: 5,
    });
    expect(settlement.recordedShots).toHaveLength(5);
    expect(() =>
      createQualificationRecoverySettlement({
        ...settlement,
        recordedShots: settlement.recordedShots.map((shot, index) =>
          index === 0 ? { ...shot, seriesNumber: settlement.sessionSeriesNumber + 1 } : shot,
        ),
      }),
    ).toThrow('settled session series');
    expect(competition).toMatchObject({ phase: 'SERIES_COMPLETE', seriesShotCount: 5 });
    expect(interruption).toBeNull();
    expect(db.prepare('SELECT id, score FROM shots ORDER BY shotNumber').all()).toEqual(before);
    expect(() => db.prepare("UPDATE qualification_recovery_settlements SET statement = 'changed'").run()).toThrow(
      'immutable',
    );
    expect(() => db.prepare('DELETE FROM qualification_recovery_settlements').run()).toThrow('immutable');
  });

  it('is idempotent for the same official application and rejects conflicting retries', async () => {
    const first = await service.apply(input());
    const retried = await service.apply(input());

    expect(retried).toEqual(first);
    expect(db.prepare('SELECT COUNT(*) AS count FROM qualification_recovery_settlements').get()).toEqual({ count: 1 });
    await expect(service.apply({ ...input(), statement: 'A different statement' })).rejects.toThrow(
      'different settlement',
    );
  });

  it('coalesces concurrent applications of the same immutable decision', async () => {
    const [first, second] = await Promise.all([service.apply(input()), service.apply(input())]);

    expect(second).toEqual(first);
    expect(db.prepare('SELECT COUNT(*) AS count FROM qualification_recovery_settlements').get()).toEqual({ count: 1 });
  });

  it('does not create a new settlement after the matching paused interruption is gone', async () => {
    competition = competition.keepRecordedQualificationSeries({
      programId: 'P25_MATCH_PRECISION_240',
      expectedRecordedShots: 5,
    });
    interruption = null;

    await expect(service.apply(input())).rejects.toThrow('has no paused Lane interruption');
    expect(db.prepare('SELECT COUNT(*) AS count FROM qualification_recovery_settlements').get()).toEqual({ count: 0 });
  });

  it('rejects settlement while an isolated recovery firing window is still running', async () => {
    service = createService(
      () =>
        ({
          runId: '44444444-4444-4444-8444-444444444444',
          decisionId: '55555555-5555-4555-8555-555555555555',
          interruptionId: '66666666-6666-4666-8666-666666666666',
          competitionId: COMPETITION_ID,
          status: 'RUNNING',
        }) as unknown as QualificationRecoveryRunRecord,
    );

    await expect(service.apply(input())).rejects.toThrow('is still running');
  });

  function createService(getLatest: () => QualificationRecoveryRunRecord | null) {
    return new QualificationRecoverySettlementService(
      new SqliteQualificationRecoverySettlementRepository(db),
      sessionRepository,
      competitionRepository,
      {
        get: () => interruption,
        clear: () => {
          interruption = null;
        },
      },
      { getLatest },
      new TypedEventBus(),
    );
  }
});

function input() {
  return {
    decisionId: DECISION_ID,
    competitionId: COMPETITION_ID,
    interruptionId: INTERRUPTION_ID,
    treatment: 'KEEP_RECORDED_SERIES' as const,
    stageIndex: 1,
    seriesIndex: 0,
    expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
    expectedSeriesShotLimit: 5,
    expectedRecordedShots: 5,
    decisionOfficialName: 'Jury Member A',
    decisionRuleReference: 'ISSF 8.8.1',
    decidedAt: new Date('2026-09-04T01:06:00.000Z'),
    appliedBy: 'Jury Member A',
    statement: 'The complete recorded series is retained and the interrupted window is closed.',
    appliedAt: APPLIED_AT,
  };
}
