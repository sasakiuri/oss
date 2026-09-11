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

    it('rejects a start when the injected execution gate is closed', () => {
      timerService = new LaneTimerService(mockCompetitionRepo, mockEventBus, () => false);

      expect(() => timerService.start('comp-1', 600, 600)).toThrow('Lane execution gate');
      expect(vi.getTimerCount()).toBe(0);
      expect(mockEventBus.emit).not.toHaveBeenCalled();
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
    it('expires immediately if loading the competition crosses the original deadline', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      vi.mocked(mockCompetitionRepo.findById).mockImplementation(async () => {
        vi.setSystemTime(Date.now() + 2_000);
        return state;
      });

      await timerService.startAt('comp-1', new Date().toISOString(), 1);

      expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'TimerExpired' }));
      expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps the absolute deadline when a command arrives between whole seconds', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);
      const receivedAt = Date.now();
      await timerService.startAt('comp-1', new Date(receivedAt - 1_500).toISOString(), 60);

      vi.setSystemTime(receivedAt + 58_499);
      await timerService.processTick();
      expect(mockEventBus.emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'TimerExpired' }));

      vi.setSystemTime(receivedAt + 58_500);
      await timerService.processTick();
      expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'TimerExpired' }));
    });

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
      timerService.start('comp-1', 600, 600);
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
      expect(timerService.sample('comp-1')).toMatchObject({ running: false, remainingMs: 0 });
    });

    it('future time: timer waits until the absolute start time', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

      // starts 5 seconds in the future
      const fiveSecondsLater = new Date(Date.now() + 5_000).toISOString();
      const startPromise = timerService.startAt('comp-1', fiveSecondsLater, 60);

      await vi.advanceTimersByTimeAsync(4_999);
      expect(mockCompetitionRepo.findById).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await startPromise;

      // tickTimerBy is not called (elapsedSeconds <= 0)
      // save is not called (elapsed <= 0 branch)
      expect(mockCompetitionRepo.save).not.toHaveBeenCalled();
      // timer is started
      expect(vi.getTimerCount()).toBe(1);
    });

    it('cancels a pending absolute start when stopped', async () => {
      const fiveSecondsLater = new Date(Date.now() + 5_000).toISOString();
      const startPromise = timerService.startAt('comp-1', fiveSecondsLater, 60);

      timerService.stop();
      await vi.advanceTimersByTimeAsync(5_000);
      await startPromise;

      expect(mockCompetitionRepo.findById).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('rejects a pending absolute start if the execution gate closes while waiting', async () => {
      let permitted = true;
      timerService = new LaneTimerService(mockCompetitionRepo, mockEventBus, () => permitted);
      const fiveSecondsLater = new Date(Date.now() + 5_000).toISOString();
      const startPromise = timerService.startAt('comp-1', fiveSecondsLater, 60);
      const rejection = expect(startPromise).rejects.toMatchObject({ code: 'LANE_TIMER_RUN_BLOCKED' });

      permitted = false;
      await vi.advanceTimersByTimeAsync(5_000);

      await rejection;
      expect(mockCompetitionRepo.findById).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
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
    it('does not count the same wall-clock interval twice after a rollback', async () => {
      const startedAt = Date.now();
      timerService.start('comp-1', 600, 600);
      for (const elapsedMs of [10_000, 5_000, 10_000, 11_000]) {
        vi.setSystemTime(startedAt + elapsedMs);
        await timerService.processTick();
      }

      expect(mockEventBus.emit).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'TimerTick', remainingSeconds: 589 }),
      );
    });

    it('does not accumulate rounding errors across delayed callbacks', async () => {
      timerService.start('comp-1', 600, 600);
      for (let tick = 0; tick < 10; tick += 1) {
        vi.setSystemTime(Date.now() + 1_499);
        await timerService.processTick();
      }

      expect(mockEventBus.emit).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'TimerTick', remainingSeconds: 586 }),
      );
    });

    it('does not expire early when callbacks occur within the same second', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);
      timerService.start('comp-1', 2, 600);
      for (let tick = 0; tick < 3; tick += 1) {
        vi.setSystemTime(Date.now() + 600);
        await timerService.processTick();
      }

      expect(mockEventBus.emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'TimerExpired' }));
      expect(mockEventBus.emit).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'TimerTick', remainingSeconds: 1 }),
      );
    });

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

    it('stops without expiring when the execution gate closes before a tick', async () => {
      let permitted = true;
      timerService = new LaneTimerService(mockCompetitionRepo, mockEventBus, () => permitted);
      timerService.start('comp-1', 1, 600);
      vi.clearAllMocks();

      permitted = false;
      vi.setSystemTime(Date.now() + 1000);
      await timerService.processTick();

      expect(vi.getTimerCount()).toBe(0);
      expect(mockCompetitionRepo.findById).not.toHaveBeenCalled();
      expect(mockCompetitionRepo.save).not.toHaveBeenCalled();
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });
  });

  describe('expire()', () => {
    it('forces an ACTIVE competition to SERIES_COMPLETE', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

      timerService.start('comp-1', 600, 600);
      await timerService.expire('comp-1');

      expect(mockCompetitionRepo.save).toHaveBeenCalledTimes(2);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PhaseChanged', newPhase: 'SERIES_COMPLETE' }),
      );
      expect(timerService.sample('comp-1')).toMatchObject({ running: false, remainingMs: 0 });
    });

    it('does not finalize expiry if the execution gate closes during persistence', async () => {
      let permitted = true;
      let releaseFirstSave!: () => void;
      const firstSave = new Promise<void>((resolve) => {
        releaseFirstSave = resolve;
      });
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);
      vi.mocked(mockCompetitionRepo.save).mockImplementationOnce(async () => firstSave);
      timerService = new LaneTimerService(mockCompetitionRepo, mockEventBus, () => permitted);

      const expiry = timerService.expire('comp-1');
      await Promise.resolve();
      expect(mockCompetitionRepo.save).toHaveBeenCalledTimes(1);

      permitted = false;
      releaseFirstSave();

      await expect(expiry).rejects.toMatchObject({ code: 'LANE_TIMER_RUN_BLOCKED' });
      expect(mockCompetitionRepo.save).toHaveBeenCalledTimes(1);
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });
  });

  describe('interruption controls', () => {
    it.each([
      { clockChangeMs: -60_000, remainingMs: 590_000 },
      { clockChangeMs: 250, remainingMs: 589_750 },
    ])('samples the stopped time after a $clockChangeMs ms clock change', async ({ clockChangeMs, remainingMs }) => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);
      timerService.start('comp-1', 600, 600);
      vi.setSystemTime(Date.now() + 10_000);
      await timerService.processTick();
      vi.setSystemTime(Date.now() + clockChangeMs);

      await expect(timerService.pause('comp-1')).resolves.toEqual({ remainingSeconds: 590, totalSeconds: 600 });

      expect(timerService.sample('comp-1')).toMatchObject({ running: false, remainingMs, sampledAt: Date.now() });
      expect(mockCompetitionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ timer: expect.objectContaining({ remainingSeconds: 590 }) }),
      );
    });

    it('does not stop a replacement timer while loading the interrupted competition', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      let releaseRead!: (value: CompetitionState) => void;
      vi.mocked(mockCompetitionRepo.findById).mockImplementationOnce(
        () =>
          new Promise<CompetitionState>((resolve) => {
            releaseRead = resolve;
          }),
      );
      timerService.start('comp-1', 600, 600);
      const pause = timerService.pause('comp-1');
      timerService.start('comp-1', 900, 900);
      releaseRead(state);

      await expect(pause).rejects.toThrow('timer changed');
      expect(mockCompetitionRepo.save).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(mockEventBus.emit).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'TimerTick', remainingSeconds: 899 }),
      );
    });

    it('does not stop or report a stale pause over a replacement timer during persistence', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);
      let releaseSave!: () => void;
      vi.mocked(mockCompetitionRepo.save).mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseSave = resolve;
          }),
      );
      timerService.start('comp-1', 600, 600);
      const pause = timerService.pause('comp-1');
      await Promise.resolve();
      timerService.start('comp-1', 900, 900);
      vi.clearAllMocks();
      releaseSave();

      await expect(pause).rejects.toThrow('timer changed');
      expect(mockEventBus.emit).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(mockEventBus.emit).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'TimerTick', remainingSeconds: 899 }),
      );
    });

    it('keeps the countdown frozen while saving the interrupted time', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);
      let releaseSave!: () => void;
      vi.mocked(mockCompetitionRepo.save).mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseSave = resolve;
          }),
      );
      timerService.start('comp-1', 600, 600);
      vi.setSystemTime(Date.now() + 10_000);

      const pause = timerService.pause('comp-1');
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(600_000);
      releaseSave();

      await expect(pause).resolves.toEqual({ remainingSeconds: 590, totalSeconds: 600 });
      expect(mockCompetitionRepo.save).toHaveBeenCalledTimes(1);
      expect(mockEventBus.emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'TimerExpired' }));
      expect(mockEventBus.emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'PhaseChanged' }));
    });

    it('remains stopped when persisting the interrupted time fails', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);
      vi.mocked(mockCompetitionRepo.save).mockRejectedValueOnce(new Error('storage unavailable'));
      timerService.start('comp-1', 600, 600);

      await expect(timerService.pause('comp-1')).rejects.toThrow('storage unavailable');
      vi.clearAllMocks();
      await vi.advanceTimersByTimeAsync(600_000);

      expect(vi.getTimerCount()).toBe(0);
      expect(mockCompetitionRepo.save).not.toHaveBeenCalled();
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('freezes and persists the exact in-memory remaining time', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);
      timerService.start('comp-1', 600, 600);
      vi.setSystemTime(Date.now() + 10_000);

      const captured = await timerService.pause('comp-1');

      expect(captured).toEqual({ remainingSeconds: 590, totalSeconds: 600 });
      expect(mockCompetitionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ timer: expect.objectContaining({ remainingSeconds: 590, totalSeconds: 600 }) }),
      );
      expect(vi.getTimerCount()).toBe(0);
    });

    it('persists the authorized duration before starting the resumed timer', async () => {
      const original = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      let current = original;
      vi.mocked(mockCompetitionRepo.findById).mockImplementation(async () => current);
      vi.mocked(mockCompetitionRepo.save).mockImplementation(async (state) => {
        current = state;
      });

      await timerService.resumeAt('comp-1', new Date().toISOString(), 540);

      expect(current.timer).toMatchObject({ remainingSeconds: 540, totalSeconds: 540 });
      expect(vi.getTimerCount()).toBe(1);
    });
  });
});
