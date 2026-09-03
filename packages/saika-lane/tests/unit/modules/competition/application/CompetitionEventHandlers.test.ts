// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => mockLogger,
  initializeLogger: vi.fn(),
  resetLogger: vi.fn(),
}));

import {
  createPhaseChangedHandler,
  createShotRecordedHandler,
  createTimedTargetSequenceChangedHandler,
} from '@/main/modules/competition/application/CompetitionEventHandlers';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S, P25 } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { PhaseChangedEvent, ShotRecordedEvent } from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

describe('createShotRecordedHandler', () => {
  let mockRepo: ICompetitionRepository;
  let mockEventBus: IEventBus;

  beforeEach(() => {
    mockRepo = {
      save: vi.fn(),
      findById: vi.fn(),
      findBySessionId: vi.fn(),
      findActive: vi.fn(),
      delete: vi.fn(),
    };
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    };
    mockLogger.error.mockClear();
  });

  it('should do nothing when there is no active competition', async () => {
    vi.mocked(mockRepo.findActive).mockResolvedValue(null);

    const handler = createShotRecordedHandler({ competitionRepository: mockRepo, eventBus: mockEventBus });
    await handler();

    expect(mockRepo.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it('should do nothing when shot cannot be accepted', async () => {
    // SERIES_COMPLETE phase → canAcceptShot() returns false
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage().expireTimer();
    vi.mocked(mockRepo.findActive).mockResolvedValue(state);

    const handler = createShotRecordedHandler({ competitionRepository: mockRepo, eventBus: mockEventBus });
    await handler();

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('should accept shot in IDLE (training mode) but skip series recording', async () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
    expect(state.phase).toBe('IDLE');
    vi.mocked(mockRepo.findActive).mockResolvedValue(state);

    const handler = createShotRecordedHandler({ competitionRepository: mockRepo, eventBus: mockEventBus });
    await handler();

    // canAcceptShot() returns true for IDLE, but recordShotInSeries is skipped
    expect(mockRepo.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it('should record and save shot in ACTIVE state', async () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    vi.mocked(mockRepo.findActive).mockResolvedValue(state);

    const handler = createShotRecordedHandler({ competitionRepository: mockRepo, eventBus: mockEventBus });
    await handler();

    expect(mockRepo.save).toHaveBeenCalledTimes(1);
    const savedState = vi.mocked(mockRepo.save).mock.calls[0]![0];
    expect(savedState.seriesShotCount).toBe(1);
  });

  it('should emit SeriesCompleted event when series is complete', async () => {
    // Advance to match stage (maxShots=10)
    let state = CompetitionState.create('comp-1', 'session-1', BR60S.config)
      .startStage()
      .expireTimer()
      .advanceToNextStage()
      .startNextSeries();

    const maxShots = state.currentSeriesConfig.maxShots;

    // Record maxShots - 1 shots, leaving one shot until series complete
    for (let i = 0; i < maxShots - 1; i++) {
      state = state.recordShotInSeries();
    }
    vi.mocked(mockRepo.findActive).mockResolvedValue(state);

    const handler = createShotRecordedHandler({ competitionRepository: mockRepo, eventBus: mockEventBus });
    await handler();

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SeriesCompleted',
        aggregateId: 'comp-1',
      }),
    );
  });

  it('does not count authorized sighting shots in a scored stage', async () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config)
      .startStage()
      .expireTimer()
      .advanceToNextStage()
      .startNextSeries();
    vi.mocked(mockRepo.findActive).mockResolvedValue(state);
    const event = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-1',
      shot: { mode: Mode.sighting() },
      scoringMode: 'DECIMAL',
    } as ShotRecordedEvent;

    const handler = createShotRecordedHandler({ competitionRepository: mockRepo, eventBus: mockEventBus });
    await handler(event);

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('does not count an isolated MATCH shot in the ordinary competition series', async () => {
    const event = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-1',
      shot: { mode: Mode.match() },
      scoringMode: 'DECIMAL',
      acquisitionContext: {
        shotDisposition: 'ISOLATED',
        owner: 'qualification-recovery',
        referenceId: 'recovery-run-1',
      },
    } as ShotRecordedEvent;

    const handler = createShotRecordedHandler({ competitionRepository: mockRepo, eventBus: mockEventBus });
    await handler(event);

    expect(mockRepo.findActive).not.toHaveBeenCalled();
    expect(mockRepo.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it('should not emit SeriesCompleted event when series is not yet complete', async () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    vi.mocked(mockRepo.findActive).mockResolvedValue(state);

    const handler = createShotRecordedHandler({ competitionRepository: mockRepo, eventBus: mockEventBus });
    await handler();

    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it('should log error and not throw exception on repository error', async () => {
    vi.mocked(mockRepo.findActive).mockRejectedValue(new Error('DB failure'));

    const handler = createShotRecordedHandler({ competitionRepository: mockRepo, eventBus: mockEventBus });
    await expect(handler()).resolves.toBeUndefined();

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to record shot in competition',
      'domain',
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it('should also log non-Error object errors', async () => {
    vi.mocked(mockRepo.findActive).mockRejectedValue('string error');

    const handler = createShotRecordedHandler({ competitionRepository: mockRepo, eventBus: mockEventBus });
    await expect(handler()).resolves.toBeUndefined();

    expect(mockLogger.error).toHaveBeenCalledWith('Failed to record shot in competition', 'domain', {
      error: 'string error',
    });
  });
});

describe('createPhaseChangedHandler', () => {
  let mockTimerService: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
  let mockRepo: ICompetitionRepository;

  beforeEach(() => {
    mockTimerService = {
      start: vi.fn(),
      stop: vi.fn(),
    };
    mockRepo = {
      save: vi.fn(),
      findById: vi.fn(),
      findBySessionId: vi.fn(),
      findActive: vi.fn(),
      delete: vi.fn(),
    };
  });

  function makePhaseChangedEvent(newPhase: string, aggregateId = 'comp-1'): PhaseChangedEvent {
    return {
      type: 'PhaseChanged',
      timestamp: Date.now(),
      aggregateId,
      previousPhase: 'IDLE',
      newPhase,
      stageIndex: 0,
      seriesIndex: 0,
      stageName: 'preparation',
      scored: false,
    } as PhaseChangedEvent;
  }

  it('should fetch timer info from repository and start timer in ACTIVE phase', async () => {
    const state = CompetitionState.create('comp-42', 'session-1', BR60S.config).startStage();
    vi.mocked(mockRepo.findById).mockResolvedValue(state);

    const handler = createPhaseChangedHandler({
      competitionRepository: mockRepo,
      timerService: mockTimerService as unknown as LaneTimerService,
    });
    handler(makePhaseChangedEvent('ACTIVE', 'comp-42'));

    // Wait for async processing
    await vi.waitFor(() => {
      expect(mockTimerService.start).toHaveBeenCalledWith(
        'comp-42',
        state.timer.remainingSeconds,
        state.timer.totalSeconds,
      );
    });
    expect(mockTimerService.stop).not.toHaveBeenCalled();
  });

  it('should not start timer when competition is not found in ACTIVE phase', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(null);

    const handler = createPhaseChangedHandler({
      competitionRepository: mockRepo,
      timerService: mockTimerService as unknown as LaneTimerService,
    });
    handler(makePhaseChangedEvent('ACTIVE'));

    await vi.waitFor(() => {
      expect(mockRepo.findById).toHaveBeenCalled();
    });
    expect(mockTimerService.start).not.toHaveBeenCalled();
  });

  it('should log error and not start timer on repository error in ACTIVE phase', async () => {
    vi.mocked(mockRepo.findById).mockRejectedValue(new Error('DB error'));

    const handler = createPhaseChangedHandler({
      competitionRepository: mockRepo,
      timerService: mockTimerService as unknown as LaneTimerService,
    });
    handler(makePhaseChangedEvent('ACTIVE'));

    await vi.waitFor(() => {
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start timer from PhaseChanged',
        'domain',
        expect.objectContaining({ error: expect.any(String) }),
      );
    });
    expect(mockTimerService.start).not.toHaveBeenCalled();
  });

  it('should stop timer in SERIES_COMPLETE phase', () => {
    const handler = createPhaseChangedHandler({
      competitionRepository: mockRepo,
      timerService: mockTimerService as unknown as LaneTimerService,
    });
    handler(makePhaseChangedEvent('SERIES_COMPLETE'));

    expect(mockTimerService.stop).toHaveBeenCalledTimes(1);
    expect(mockTimerService.start).not.toHaveBeenCalled();
  });

  it('should stop timer in FINISHED phase', () => {
    const handler = createPhaseChangedHandler({
      competitionRepository: mockRepo,
      timerService: mockTimerService as unknown as LaneTimerService,
    });
    handler(makePhaseChangedEvent('FINISHED'));

    expect(mockTimerService.stop).toHaveBeenCalledTimes(1);
    expect(mockTimerService.start).not.toHaveBeenCalled();
  });

  it('should stop timer in IDLE phase', () => {
    const handler = createPhaseChangedHandler({
      competitionRepository: mockRepo,
      timerService: mockTimerService as unknown as LaneTimerService,
    });
    handler(makePhaseChangedEvent('IDLE'));

    expect(mockTimerService.stop).toHaveBeenCalledTimes(1);
    expect(mockTimerService.start).not.toHaveBeenCalled();
  });

  it('should stop timer in SERIES_ENTERED phase', () => {
    const handler = createPhaseChangedHandler({
      competitionRepository: mockRepo,
      timerService: mockTimerService as unknown as LaneTimerService,
    });
    handler(makePhaseChangedEvent('SERIES_ENTERED'));

    expect(mockTimerService.stop).toHaveBeenCalledTimes(1);
    expect(mockTimerService.start).not.toHaveBeenCalled();
  });

  it('should stop timer in STAGE_ENTERED phase', () => {
    const handler = createPhaseChangedHandler({
      competitionRepository: mockRepo,
      timerService: mockTimerService as unknown as LaneTimerService,
    });
    handler(makePhaseChangedEvent('STAGE_ENTERED'));

    expect(mockTimerService.stop).toHaveBeenCalledTimes(1);
    expect(mockTimerService.start).not.toHaveBeenCalled();
  });
});

describe('createTimedTargetSequenceChangedHandler', () => {
  it('completes only the matching MATCH series after the final EST recording edge', async () => {
    const active = CompetitionState.create('comp-1', 'session-1', P25.config)
      .startStage()
      .expireTimer()
      .advanceToNextStage()
      .startNextSeries()
      .recordShotInSeries();
    const mockRepo = {
      save: vi.fn(),
      findById: vi.fn().mockResolvedValue(active),
      findBySessionId: vi.fn(),
      findActive: vi.fn(),
      delete: vi.fn(),
    } satisfies ICompetitionRepository;
    const mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    } satisfies IEventBus;
    const handler = createTimedTargetSequenceChangedHandler({
      competitionRepository: mockRepo,
      eventBus: mockEventBus,
    });

    handler({
      type: 'TimedTargetSequenceChanged',
      timestamp: Date.now(),
      aggregateId: active.id,
      state: {
        sequenceId: '00000000-0000-4000-8000-000000000001',
        competitionId: active.id,
        programId: 'P25_MATCH_PRECISION_240',
        programLabel: 'Precision competition series',
        purpose: 'MATCH',
        stageIndex: 1,
        seriesIndex: 0,
        targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
        ruleReference: '6.4.13, 8.7.6.4(g)',
        phase: 'COMPLETE',
        signal: 'RED',
        shotWindowOpen: false,
        exposureIndex: null,
        exposureCount: 1,
        acceptedShotsInExposure: 0,
        loadAt: new Date('2026-09-03T00:00:00.000Z'),
        attentionAt: new Date('2026-09-03T00:01:00.000Z'),
        completesAt: new Date('2026-09-03T00:05:07.300Z'),
        nextLoadAllowedAt: new Date('2026-09-03T00:06:07.300Z'),
        nextTransitionAt: null,
        terminalReason: 'All valid EST recording windows elapsed',
      },
    });

    await vi.waitFor(() => expect(mockRepo.save).toHaveBeenCalledOnce());
    expect(vi.mocked(mockRepo.save).mock.calls[0]?.[0]).toMatchObject({
      phase: 'SERIES_COMPLETE',
      seriesShotCount: 1,
    });
    expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'PhaseChanged' }));
    expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'SeriesCompleted', shotCount: 1 }));
  });

  it('ignores sighting completion without mutating competition progress', async () => {
    const active = CompetitionState.create('comp-1', 'session-1', P25.config)
      .startStage()
      .expireTimer()
      .advanceToNextStage()
      .startNextSeries();
    const mockRepo = {
      save: vi.fn(),
      findById: vi.fn().mockResolvedValue(active),
      findBySessionId: vi.fn(),
      findActive: vi.fn(),
      delete: vi.fn(),
    } satisfies ICompetitionRepository;
    const mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    } satisfies IEventBus;

    createTimedTargetSequenceChangedHandler({ competitionRepository: mockRepo, eventBus: mockEventBus })({
      type: 'TimedTargetSequenceChanged',
      timestamp: Date.now(),
      aggregateId: active.id,
      state: { purpose: 'SIGHTING', phase: 'COMPLETE' } as never,
    });

    await Promise.resolve();
    expect(mockRepo.findById).not.toHaveBeenCalled();
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('ignores an isolated MATCH acquisition owned by another workflow', async () => {
    const mockRepo = {
      save: vi.fn(),
      findById: vi.fn(),
      findBySessionId: vi.fn(),
      findActive: vi.fn(),
      delete: vi.fn(),
    } satisfies ICompetitionRepository;
    const mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    } satisfies IEventBus;

    createTimedTargetSequenceChangedHandler({ competitionRepository: mockRepo, eventBus: mockEventBus })({
      type: 'TimedTargetSequenceChanged',
      timestamp: Date.now(),
      aggregateId: 'comp-1',
      state: {
        purpose: 'MATCH',
        phase: 'COMPLETE',
        executionContext: {
          shotDisposition: 'ISOLATED',
          owner: 'qualification-recovery',
          referenceId: 'run-1',
        },
      } as never,
    });

    await Promise.resolve();
    expect(mockRepo.findById).not.toHaveBeenCalled();
    expect(mockRepo.save).not.toHaveBeenCalled();
  });
});
