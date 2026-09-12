import Database from 'better-sqlite3';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { P25, STDP } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { LaneInterruptionRecord } from '@/main/modules/competition-interruption';
import {
  createQualificationRecoveryRunStart,
  QualificationRecoveryAdjudicationService,
  SqliteQualificationRecoveryAdjudicationRepository,
  SqliteQualificationRecoveryRepository,
  SqliteQualificationRecoveryShotOutbox,
} from '@/main/modules/qualification-recovery';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import { SqliteSessionRepository } from '@/main/modules/session/infra/SqliteSessionRepository';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const DECISION_ID = '22222222-2222-4222-8222-222222222222';
const INTERRUPTION_ID = '33333333-3333-4333-8333-333333333333';
const COMPETITION_ID = '44444444-4444-4444-8444-444444444444';
const LANE_ID = '55555555-5555-4555-8555-555555555555';
const SHOT_ID = '66666666-6666-4666-8666-666666666666';
const OBSERVATION_ID = '77777777-7777-4777-8777-777777777777';

describe('QualificationRecoveryAdjudicationService', () => {
  let db: Database.Database;
  let sessionRepository: SqliteSessionRepository;
  let runRepository: SqliteQualificationRecoveryRepository;
  let adjudicationRepository: SqliteQualificationRecoveryAdjudicationRepository;
  let evidence: SqliteQualificationRecoveryShotOutbox;
  let competition: CompetitionState;
  let competitionRepository: ICompetitionRepository;
  let interruption: LaneInterruptionRecord | null;
  let clearInterruption: Mock;

  beforeEach(async () => {
    db = createSqliteDb(':memory:');
    sessionRepository = new SqliteSessionRepository(db);
    runRepository = new SqliteQualificationRecoveryRepository(db);
    adjudicationRepository = new SqliteQualificationRecoveryAdjudicationRepository(db);
    evidence = new SqliteQualificationRecoveryShotOutbox(db);

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

    competition = CompetitionState.create(COMPETITION_ID, session.id, P25.config)
      .startStage()
      .expireTimer()
      .advanceToNextStage()
      .startNextSeries()
      .recordShotInSeries()
      .recordShotInSeries();
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
      pausedAt: new Date('2026-09-03T01:01:00Z'),
      capturedAt: new Date('2026-09-03T01:01:00.010Z'),
      capturedRemainingSeconds: 0,
      capturedTotalSeconds: 0,
    });
    clearInterruption = vi.fn(() => {
      interruption = null;
    });

    runRepository.appendStarted(
      createQualificationRecoveryRunStart({
        runId: RUN_ID,
        sequenceId: RUN_ID,
        decisionId: DECISION_ID,
        interruptionId: INTERRUPTION_ID,
        competitionId: COMPETITION_ID,
        stageIndex: 1,
        seriesIndex: 0,
        expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
        executionProgramId: 'P25_MATCH_PRECISION_240:qualification-recovery',
        expectedSeriesShotLimit: 5,
        expectedRecordedShots: 2,
        authorization: {
          phase: 'SERIES_RECOVERY',
          seriesRecovery: {
            treatment: 'COMPLETE_REMAINING_SHOTS',
            shotsToFire: 3,
            execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 48, totalSeconds: 144 },
          },
        },
        targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
        loadAt: new Date('2026-09-03T01:01:30Z'),
        officialName: 'Jury Member A',
        decisionRuleReference: '8.8.1(c-d)',
        decidedAt: new Date('2026-09-03T01:01:10Z'),
        startedAt: new Date('2026-09-03T01:01:20Z'),
      }),
    );
    runRepository.appendShot(RUN_ID, {
      shotId: SHOT_ID,
      observationId: OBSERVATION_ID,
      firedAt: new Date('2026-09-03T01:02:00Z'),
      recordedAt: new Date('2026-09-03T01:02:00.010Z'),
    });
    runRepository.appendTerminal({
      runId: RUN_ID,
      status: 'COMPLETED',
      reason: 'All authorized timing windows elapsed',
      occurredAt: new Date('2026-09-03T01:04:00Z'),
      recordedAt: new Date('2026-09-03T01:04:00.010Z'),
    });
    evidence.enqueue({
      schemaVersion: 1,
      laneId: LANE_ID,
      competitionId: COMPETITION_ID,
      runId: RUN_ID,
      decisionId: DECISION_ID,
      interruptionId: INTERRUPTION_ID,
      phase: 'SERIES_RECOVERY',
      stageIndex: 1,
      seriesIndex: 0,
      shotId: SHOT_ID,
      x: 0.5,
      y: -0.5,
      rawScoreX10: 100,
      deviceScoreX10: 100,
      calculatedScoreX10: 101,
      effectiveScoreX10: 100,
      innerTen: false,
      firedAt: '2026-09-03T01:02:00.000Z',
      receivedAt: '2026-09-03T01:02:00.005Z',
      observationId: OBSERVATION_ID,
      targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
      scoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
      publishedAt: '2026-09-03T01:02:00.020Z',
    });
  });

  afterEach(() => db.close());

  it('credits observed recovery shots, fills unfired slots with misses, and completes the series', async () => {
    const eventBus = new TypedEventBus();
    const completed: number[] = [];
    eventBus.on('SeriesCompleted', (event) => completed.push(event.shotCount));
    const service = createService(eventBus);

    const result = await service.apply({
      runId: RUN_ID,
      competitionId: COMPETITION_ID,
      appliedBy: 'Range Officer B',
      statement: 'Recovery evidence checked against the Jury decision.',
      appliedAt: new Date('2026-09-03T01:04:10Z'),
    });

    expect(result.shots.map((entry) => entry.disposition)).toEqual([
      'PRESERVED_ORIGINAL',
      'PRESERVED_ORIGINAL',
      'CREDITED_RECOVERY',
      'CREDITED_MISS',
      'CREDITED_MISS',
    ]);
    const session = await sessionRepository.findById(competition.sessionId);
    expect(session?.matchShots.map((shot) => shot.score.value)).toEqual([90, 80, 100, 0, 0]);
    expect(session?.matchShots.every((shot) => shot.seriesNumber === 1)).toBe(true);
    expect(competition).toMatchObject({ phase: 'SERIES_COMPLETE', seriesShotCount: 5 });
    expect(clearInterruption).toHaveBeenCalledWith(COMPETITION_ID);
    expect(completed).toEqual([5]);
  });

  it('is idempotent and never credits the same firing evidence twice', async () => {
    const service = createService(new TypedEventBus());
    const input = {
      runId: RUN_ID,
      competitionId: COMPETITION_ID,
      appliedBy: 'Range Officer B',
      statement: 'Recovery evidence checked against the Jury decision.',
      appliedAt: new Date('2026-09-03T01:04:10Z'),
    };

    const first = await service.apply(input);
    const second = await service.apply(input);

    expect(second.id).toBe(first.id);
    expect(db.prepare('SELECT COUNT(*) AS count FROM qualification_recovery_adjudications').get()).toEqual({
      count: 1,
    });
    expect(db.prepare('SELECT COUNT(*) AS count FROM shots').get()).toEqual({ count: 5 });
  });

  it('rejects evidence that is not bound to the immutable firing journal', async () => {
    db.prepare('UPDATE qualification_recovery_shot_outbox SET payload_json = json_set(payload_json, ?, ?)').run(
      '$.decisionId',
      '88888888-8888-4888-8888-888888888888',
    );

    await expect(
      createService(new TypedEventBus()).apply({
        runId: RUN_ID,
        competitionId: COMPETITION_ID,
        appliedBy: 'Range Officer B',
        statement: 'Recovery evidence checked.',
        appliedAt: new Date('2026-09-03T01:04:10Z'),
      }),
    ).rejects.toThrow('decisionId');
    expect(adjudicationRepository.findByRunId(RUN_ID)).toBeNull();
  });

  it('archives an annulled Standard Pistol series and credits only its repeat', async () => {
    const runId = '88888888-8888-4888-8888-888888888888';
    const competitionId = '99999999-9999-4999-8999-999999999999';
    const shotId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    let session = Session.create(Discipline.pistol25m(), 'RING');
    session = session.recordShot(
      new ImpactPoint(1, 1),
      new Score(90),
      new Date('2026-09-03T02:00:01Z'),
      undefined,
      false,
      Mode.match(),
    );
    session = session.recordShot(
      new ImpactPoint(2, 1),
      new Score(80),
      new Date('2026-09-03T02:00:02Z'),
      undefined,
      false,
      Mode.match(),
    );
    await sessionRepository.save(session);
    let standardCompetition = CompetitionState.create(competitionId, session.id, STDP.config)
      .startStage()
      .expireTimer()
      .advanceToNextStage()
      .startNextSeries()
      .recordShotInSeries()
      .recordShotInSeries();
    const standardRepository: ICompetitionRepository = {
      save: vi.fn(async (state: CompetitionState) => {
        standardCompetition = state;
      }),
      findById: vi.fn(async () => standardCompetition),
      findBySessionId: vi.fn(),
      findActive: vi.fn(async () => standardCompetition),
      delete: vi.fn(),
    };
    runRepository.appendStarted(
      createQualificationRecoveryRunStart({
        runId,
        sequenceId: runId,
        decisionId: DECISION_ID,
        interruptionId: INTERRUPTION_ID,
        competitionId,
        stageIndex: 1,
        seriesIndex: 0,
        expectedMatchProgramId: 'STDP_MATCH_150',
        executionProgramId: 'STDP_MATCH_150',
        expectedSeriesShotLimit: 5,
        expectedRecordedShots: 2,
        authorization: {
          phase: 'SERIES_RECOVERY',
          seriesRecovery: {
            treatment: 'ANNUL_AND_REPEAT',
            shotsToFire: 5,
            execution: { mode: 'SAME_TIMED_TARGET_PROGRAM' },
          },
        },
        targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
        loadAt: new Date('2026-09-03T02:01:30Z'),
        officialName: 'Jury Member A',
        decisionRuleReference: '8.8.1(b)',
        decidedAt: new Date('2026-09-03T02:01:10Z'),
        startedAt: new Date('2026-09-03T02:01:20Z'),
      }),
    );
    runRepository.appendShot(runId, {
      shotId,
      observationId: OBSERVATION_ID,
      firedAt: new Date('2026-09-03T02:02:00Z'),
      recordedAt: new Date('2026-09-03T02:02:00.010Z'),
    });
    runRepository.appendTerminal({
      runId,
      status: 'COMPLETED',
      reason: 'Repeated series window elapsed',
      occurredAt: new Date('2026-09-03T02:04:00Z'),
      recordedAt: new Date('2026-09-03T02:04:00.010Z'),
    });
    evidence.enqueue({
      schemaVersion: 1,
      laneId: LANE_ID,
      competitionId,
      runId,
      decisionId: DECISION_ID,
      interruptionId: INTERRUPTION_ID,
      phase: 'SERIES_RECOVERY',
      stageIndex: 1,
      seriesIndex: 0,
      shotId,
      x: 0.5,
      y: -0.5,
      rawScoreX10: 100,
      deviceScoreX10: 100,
      calculatedScoreX10: 100,
      effectiveScoreX10: 100,
      innerTen: false,
      firedAt: '2026-09-03T02:02:00.000Z',
      receivedAt: '2026-09-03T02:02:00.005Z',
      observationId: OBSERVATION_ID,
      targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
      scoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
      publishedAt: '2026-09-03T02:02:00.020Z',
    });
    const standardInterruption = LaneInterruptionRecord.create({
      competitionId,
      interruptionId: INTERRUPTION_ID,
      status: 'PAUSED',
      pausedAt: new Date('2026-09-03T02:01:00Z'),
      capturedAt: new Date('2026-09-03T02:01:00.010Z'),
      capturedRemainingSeconds: 0,
      capturedTotalSeconds: 0,
    });
    const service = new QualificationRecoveryAdjudicationService(
      { get: (candidate) => runRepository.findByRunId(candidate) },
      evidence,
      adjudicationRepository,
      sessionRepository,
      standardRepository,
      { get: () => standardInterruption, clear: vi.fn() },
      new TypedEventBus(),
    );

    const result = await service.apply({
      runId,
      competitionId,
      appliedBy: 'Range Officer B',
      statement: 'Repeated series checked.',
      appliedAt: new Date('2026-09-03T02:04:10Z'),
    });

    expect(result.shots.map((entry) => entry.disposition)).toEqual([
      'ANNULLED_ORIGINAL',
      'ANNULLED_ORIGINAL',
      'CREDITED_RECOVERY',
      'CREDITED_MISS',
      'CREDITED_MISS',
      'CREDITED_MISS',
      'CREDITED_MISS',
    ]);
    const projected = await sessionRepository.findById(session.id);
    expect(projected?.matchShots.map((shot) => shot.score.value)).toEqual([100, 0, 0, 0, 0]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM shots WHERE sessionId = ?').get(session.id)).toEqual({ count: 7 });
    expect(standardCompetition).toMatchObject({ phase: 'SERIES_COMPLETE', seriesShotCount: 5 });
  });

  function createService(eventBus: TypedEventBus): QualificationRecoveryAdjudicationService {
    return new QualificationRecoveryAdjudicationService(
      { get: (runId) => runRepository.findByRunId(runId) },
      evidence,
      adjudicationRepository,
      sessionRepository,
      competitionRepository,
      { get: () => interruption, clear: clearInterruption },
      eventBus,
      () => new Date('2026-09-03T01:04:10Z'),
    );
  }
});
