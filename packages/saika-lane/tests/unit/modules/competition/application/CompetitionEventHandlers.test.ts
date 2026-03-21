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
} from '@/main/modules/competition/application/CompetitionEventHandlers';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import type { PhaseChangedEvent } from '@/main/shared-infra/events/coreEvents';
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
