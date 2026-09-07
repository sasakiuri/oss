// SPDX-License-Identifier: MIT
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { P25 } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { LaneInterruptionRecord } from '@/main/modules/competition-interruption';
import {
  QualificationRecoveryService,
  SqliteQualificationRecoveryRepository,
  type StartQualificationRecoveryRunInput,
} from '@/main/modules/qualification-recovery';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import { SqliteTimedTargetSequenceRepository, TimedTargetSequenceService } from '@/main/modules/timed-target';
import type { ITimedTargetControl } from '@/main/modules/timed-target';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

describe('QualificationRecoveryService', () => {
  let db: Database.Database;
  let eventBus: TypedEventBus;
  let timedTarget: TimedTargetSequenceService;
  let recovery: QualificationRecoveryService;
  let competition: CompetitionState;
  let competitionRepository: ICompetitionRepository;
  let interruption: LaneInterruptionRecord;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T00:00:00.000Z'));
    db = createSqliteDb(':memory:');
    eventBus = new TypedEventBus();
    competition = CompetitionState.create('competition-1', 'session-1', P25.config)
      .startStage()
      .expireTimer()
      .advanceToNextStage()
      .startNextSeries()
      .recordShotInSeries()
      .recordShotInSeries()
      .recordShotInSeries();
    competitionRepository = {
      save: vi.fn(),
      findById: vi.fn().mockResolvedValue(competition),
      findBySessionId: vi.fn(),
      findActive: vi.fn().mockResolvedValue(competition),
      delete: vi.fn(),
    };
    interruption = LaneInterruptionRecord.create({
      competitionId: competition.id,
      interruptionId: 'interruption-1',
      status: 'PAUSED',
      pausedAt: new Date('2026-09-02T23:40:00.000Z'),
      capturedAt: new Date('2026-09-02T23:40:00.100Z'),
      capturedRemainingSeconds: 0,
      capturedTotalSeconds: 0,
    });
    timedTarget = new TimedTargetSequenceService(new SqliteTimedTargetSequenceRepository(db), {
      publish: (state) =>
        eventBus.emit({
          type: 'TimedTargetSequenceChanged',
          timestamp: Date.now(),
          aggregateId: state.competitionId,
          state,
        }),
    });
    recovery = new QualificationRecoveryService(
      new SqliteQualificationRecoveryRepository(db),
      competitionRepository,
      { get: () => interruption },
      timedTarget,
      eventBus,
    );
  });

  afterEach(() => {
    timedTarget.dispose();
    db.close();
    vi.useRealTimers();
  });

  function precisionCompletionInput(): StartQualificationRecoveryRunInput {
    return {
      runId: 'run-1',
      decisionId: 'decision-1',
      interruptionId: interruption.interruptionId,
      competitionId: competition.id,
      stageIndex: 1,
      seriesIndex: 0,
      expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
      expectedSeriesShotLimit: 5,
      expectedRecordedShots: 3,
      authorization: {
        phase: 'SERIES_RECOVERY',
        seriesRecovery: {
          treatment: 'COMPLETE_REMAINING_SHOTS',
          shotsToFire: 2,
          execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 48, totalSeconds: 96 },
        },
      },
      loadAt: new Date('2026-09-03T00:00:03.000Z'),
      officialName: 'Jury Member',
      decisionRuleReference: '8.8.1(c-d)',
      decidedAt: new Date('2026-09-03T00:00:00.000Z'),
    };
  }

  it('starts an isolated 48-second-per-shot run and never changes the ordinary series', async () => {
    const changed: string[] = [];
    eventBus.on('QualificationRecoveryChanged', (event) => changed.push(event.state.status));

    const started = await recovery.start(precisionCompletionInput());

    expect(started).toMatchObject({
      status: 'RUNNING',
      expectedRecordedShots: 3,
      executionProgramId: 'P25_MATCH_PRECISION_240',
      shots: [],
    });
    expect(timedTarget.getState(competition.id)).toMatchObject({
      executionContext: {
        shotDisposition: 'ISOLATED',
        owner: 'qualification-recovery',
        referenceId: 'run-1',
      },
      exposureCount: 1,
    });
    expect(competition.seriesShotCount).toBe(3);

    await vi.advanceTimersByTimeAsync(70_100);
    const firedAt = new Date();
    const decision = timedTarget.tryAcceptShot({
      competitionId: competition.id,
      stageIndex: 1,
      seriesIndex: 0,
      expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
      targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
      observationId: 'observation-1',
      firedAt,
    });
    const shot = Shot.create({
      impactPoint: new ImpactPoint(1, 1),
      score: new Score(100),
      mode: Mode.sighting(),
      timestamp: firedAt,
      shotNumber: 1,
      seriesNumber: 0,
      innerTen: false,
      sourceObservationId: 'observation-1',
    });
    eventBus.emit({
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: competition.sessionId,
      shot,
      scoringMode: 'RING',
      acquisitionContext: decision.executionContext,
    });

    expect(recovery.get('run-1')?.shots).toMatchObject([{ shotId: shot.id, observationId: 'observation-1' }]);
    await vi.advanceTimersByTimeAsync(100_000);
    expect(recovery.get('run-1')).toMatchObject({ status: 'COMPLETED', shots: [{ shotId: shot.id }] });
    expect(changed).toContain('RUNNING');
    expect(changed.at(-1)).toBe('COMPLETED');
    expect(competitionRepository.save).not.toHaveBeenCalled();
  });

  it('starts an independently authorized extra sighting run', async () => {
    const input: StartQualificationRecoveryRunInput = {
      ...precisionCompletionInput(),
      authorization: { phase: 'EXTRA_SIGHTING', shotsToFire: 5 },
    };

    await recovery.start(input);

    expect(timedTarget.getState(competition.id)).toMatchObject({
      purpose: 'SIGHTING',
      programId: 'P25_SIGHTING_PRECISION_240',
      executionContext: { referenceId: 'run-1' },
    });
  });

  it('checks the completed sighting run and pause from durable Lane evidence after restart', async () => {
    const input = precisionCompletionInput();
    await recovery.start({ ...input, runId: 'sighting-1', authorization: { phase: 'EXTRA_SIGHTING', shotsToFire: 5 } });
    await vi.advanceTimersByTimeAsync(320_000);
    const completed = recovery.get('sighting-1')!;
    expect(completed.status).toBe('COMPLETED');
    const authorization = {
      ...input.authorization,
      sightingPrerequisite: { runId: 'sighting-1', minimumPauseSeconds: 60 },
    };
    const restored = new QualificationRecoveryService(
      new SqliteQualificationRecoveryRepository(db),
      competitionRepository,
      { get: () => interruption },
      timedTarget,
      eventBus,
    );
    const boundary = completed.terminalAt!.getTime() + 60_000;
    await expect(restored.start({ ...input, authorization, loadAt: new Date(boundary - 1) })).rejects.toThrow(
      'pause after sighting',
    );
    await expect(
      restored.start({ ...input, authorization, decisionId: 'another-decision', loadAt: new Date(boundary) }),
    ).rejects.toThrow('matching completed Lane evidence');
    await expect(restored.start({ ...input, authorization, loadAt: new Date(boundary) })).resolves.toMatchObject({
      status: 'RUNNING',
    });
  });

  it('is idempotent for the same run and rejects reuse with another authorization', async () => {
    const input = precisionCompletionInput();
    const first = await recovery.start(input);
    await expect(recovery.start(input)).resolves.toEqual(first);
    await expect(
      recovery.start({
        ...input,
        authorization: { phase: 'EXTRA_SIGHTING', shotsToFire: 5 },
      }),
    ).rejects.toThrow('different authorization');
  });

  it('rejects stale Lane facts before it creates an audit run', async () => {
    await expect(recovery.start({ ...precisionCompletionInput(), expectedRecordedShots: 2 })).rejects.toThrow(
      'does not match Lane 3',
    );
    expect(recovery.get('run-1')).toBeNull();
    expect(timedTarget.getState()).toBeNull();
  });

  it('records a compensating cancellation when the timing adapter cannot start', async () => {
    const failingTimedTarget = {
      start: vi.fn(() => {
        throw new Error('target driver unavailable');
      }),
      cancel: vi.fn(),
      getState: vi.fn().mockReturnValue(null),
      tryAcceptShot: vi.fn(),
      restore: vi.fn(),
      dispose: vi.fn(),
      enforcementMode: 'REQUIRED',
    } satisfies ITimedTargetControl;
    const service = new QualificationRecoveryService(
      new SqliteQualificationRecoveryRepository(db),
      competitionRepository,
      { get: () => interruption },
      failingTimedTarget,
      eventBus,
    );

    await expect(service.start({ ...precisionCompletionInput(), runId: 'run-failed' })).rejects.toThrow(
      'target driver unavailable',
    );
    expect(service.get('run-failed')).toMatchObject({
      status: 'CANCELLED',
      terminalReason: 'Timing start failed: target driver unavailable',
    });
  });
});
