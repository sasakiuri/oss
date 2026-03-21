// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

// createLogger mock
vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('LaneTimerService', () => {
  let mockCompetitionRepo: ICompetitionRepository;
  let mockEventBus: IEventBus;
  let timerService: LaneTimerService;

  beforeEach(() => {
    vi.useFakeTimers();

    mockCompetitionRepo = {
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

    timerService = new LaneTimerService(mockCompetitionRepo, mockEventBus);
  });

  afterEach(() => {
    timerService.stop();
    vi.useRealTimers();
  });

  describe('start()', () => {
    it('timer is started', () => {
      timerService.start('comp-1', 600, 600);

      expect(vi.getTimerCount()).toBe(1);
    });

    it('initial TimerTick event is emitted immediately on start (synchronous)', () => {
      timerService.start('comp-1', 600, 600);

      // emitInitialTick is synchronous so the event is emitted immediately
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TimerTick',
          aggregateId: 'comp-1',
          remainingSeconds: 600,
          totalSeconds: 600,
          formattedRemaining: '10:00',
        }),
      );
    });

    it('no repository access on start', () => {
      timerService.start('comp-1', 600, 600);

      expect(mockCompetitionRepo.findById).not.toHaveBeenCalled();
    });

    it('previous timer is cleared on restart', () => {
      timerService.start('comp-1', 600, 600);
      timerService.start('comp-2', 300, 300);

      expect(vi.getTimerCount()).toBe(1);
    });
  });

  describe('stop()', () => {
    it('timer is stopped', () => {
      timerService.start('comp-1', 600, 600);
      timerService.stop();

      expect(vi.getTimerCount()).toBe(0);
    });

    it('does nothing when already stopped', () => {
      timerService.stop();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('startAt()', () => {
    it('recent past time: timer starts with remaining time', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

      // started 10 seconds ago, total duration 60 seconds
      const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString();
      await timerService.startAt('comp-1', tenSecondsAgo, 60);

      // saved with tickTimerBy(10)
      expect(mockCompetitionRepo.save).toHaveBeenCalled();
      // timer is started
      expect(vi.getTimerCount()).toBe(1);
    });

    it('far past time: expiry is processed immediately', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

      // started 120 seconds ago, total duration 60 seconds → already expired
      const twoMinutesAgo = new Date(Date.now() - 120_000).toISOString();
      await timerService.startAt('comp-1', twoMinutesAgo, 60);

      // directly expired, events emitted without calling processTick
      expect(mockCompetitionRepo.findById).toHaveBeenCalledWith('comp-1');
      // save is called twice: tickTimerBy result + expireTimer result
      expect(mockCompetitionRepo.save).toHaveBeenCalledTimes(2);
      expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'TimerExpired' }));
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PhaseChanged',
          previousPhase: 'ACTIVE',
        }),
      );
      // timer is not started
      expect(vi.getTimerCount()).toBe(0);
    });

    it('future time: timer starts with full duration', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

      // starts 5 seconds in the future (elapsed is negative → remaining > duration → elapsedSeconds=0, tickTimerBy skipped)
      const fiveSecondsLater = new Date(Date.now() + 5_000).toISOString();
      await timerService.startAt('comp-1', fiveSecondsLater, 60);

      // tickTimerBy is not called (elapsedSeconds <= 0)
      // save is not called (elapsed <= 0 branch)
      expect(mockCompetitionRepo.save).not.toHaveBeenCalled();
      // timer is started
      expect(vi.getTimerCount()).toBe(1);
    });

    it('does nothing for non-ACTIVE phase', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
      // IDLE phase
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

      const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString();
      await timerService.startAt('comp-1', tenSecondsAgo, 60);

      expect(mockCompetitionRepo.save).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('does nothing when competition does not exist', async () => {
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(null);

      const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString();
      await timerService.startAt('comp-1', tenSecondsAgo, 60);

      expect(mockCompetitionRepo.save).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('processTick()', () => {
    it('TimerTick event is emitted from in-memory state', async () => {
      timerService.start('comp-1', 600, 600);
      vi.setSystemTime(Date.now() + 1000); // simulate 1 second elapsed
      await timerService.processTick();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TimerTick',
          remainingSeconds: 599,
          totalSeconds: 600,
          formattedRemaining: '09:59',
        }),
      );
    });

    it('does not access repository on normal tick', async () => {
      timerService.start('comp-1', 600, 600);
      vi.setSystemTime(Date.now() + 1000);
      await timerService.processTick();

      expect(mockCompetitionRepo.findById).not.toHaveBeenCalled();
      expect(mockCompetitionRepo.save).not.toHaveBeenCalled();
    });

    it('in-memory remaining time is correctly decremented across multiple ticks', async () => {
      timerService.start('comp-1', 600, 600);

      // after 1 second
      vi.setSystemTime(Date.now() + 1000);
      await timerService.processTick();

      // after 2 more seconds (drift correction advances by 2 seconds)
      vi.setSystemTime(Date.now() + 2000);
      await timerService.processTick();

      expect(mockEventBus.emit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'TimerTick',
          remainingSeconds: 597,
          totalSeconds: 600,
        }),
      );
    });

    it('persists to repository on timer expiry', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

      // start with 1 second remaining
      timerService.start('comp-1', 1, 600);
      vi.setSystemTime(Date.now() + 1000);
      await timerService.processTick();

      // saved to repository only on expiry (tickTimerBy + expireTimer)
      expect(mockCompetitionRepo.findById).toHaveBeenCalledWith('comp-1');
      expect(mockCompetitionRepo.save).toHaveBeenCalledTimes(2);
    });

    it('TimerExpired and PhaseChanged events are emitted on timer expiry', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

      // start with 1 second remaining
      timerService.start('comp-1', 1, 600);
      vi.setSystemTime(Date.now() + 1000);
      await timerService.processTick();

      expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'TimerExpired' }));
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PhaseChanged',
          previousPhase: 'ACTIVE',
          newPhase: 'SERIES_COMPLETE',
        }),
      );
    });

    it('timer stops when non-ACTIVE phase on expiry', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
      // IDLE phase
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

      timerService.start('comp-1', 1, 600);
      vi.setSystemTime(Date.now() + 1000);
      await timerService.processTick();

      expect(mockCompetitionRepo.save).not.toHaveBeenCalled();
    });

    it('timer stops when competition does not exist on expiry', async () => {
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(null);

      timerService.start('comp-1', 1, 600);
      vi.setSystemTime(Date.now() + 1000);
      await timerService.processTick();

      expect(mockCompetitionRepo.save).not.toHaveBeenCalled();
    });

    it('does nothing when competitionId is not set', async () => {
      // call processTick without calling start()
      await timerService.processTick();

      expect(mockCompetitionRepo.findById).not.toHaveBeenCalled();
    });

    it('error on timer expiry is logged', async () => {
      vi.mocked(mockCompetitionRepo.findById).mockRejectedValue(new Error('DB error'));

      timerService.start('comp-1', 1, 600);
      vi.setSystemTime(Date.now() + 1000);

      // confirm no error is thrown
      await expect(timerService.processTick()).resolves.not.toThrow();
    });

    it('formattedRemaining format matches Timer.formattedRemaining', async () => {
      timerService.start('comp-1', 65, 600);
      vi.setSystemTime(Date.now() + 1000);
      await timerService.processTick();

      // 64 seconds = 01:04
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TimerTick',
          remainingSeconds: 64,
          formattedRemaining: '01:04',
        }),
      );
    });
  });
});
