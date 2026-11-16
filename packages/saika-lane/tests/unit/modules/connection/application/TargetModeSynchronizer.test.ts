// SPDX-License-Identifier: MIT
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.fn();
vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }),
}));

import {
  TargetModeSynchronizer,
  type TargetModeContext,
} from '@/main/modules/connection/application/TargetModeSynchronizer';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import {
  createMockCompetitionRepository,
  createMockEventBus,
  createMockSessionRepository,
} from '../../../../helpers/mockDependencies';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const sentModes = (sendMode: Mock): string[] => sendMode.mock.calls.map(([mode]) => (mode as Mode).value);

describe('TargetModeSynchronizer', () => {
  let cached: Mode | null;
  let bootstrap: Mock<TargetModeContext['bootstrap']>;
  let sendMode: Mock<(mode: Mode) => Promise<void>>;
  let eventBus: IEventBus;
  let synchronizer: TargetModeSynchronizer;
  const interruptions = { get: vi.fn(() => null) };
  const sessionRepository = createMockSessionRepository();
  const competitionRepository = createMockCompetitionRepository();

  /** The next refresh reads `mode` from persisted state. */
  const persist = (mode: Mode | null): void => {
    bootstrap.mockImplementation(async () => {
      if (mode) cached = mode;
      return mode;
    });
  };

  beforeEach(() => {
    warn.mockClear();
    cached = Mode.sighting();
    bootstrap = vi.fn<TargetModeContext['bootstrap']>();
    persist(Mode.sighting());
    sendMode = vi.fn(async () => undefined);
    eventBus = createMockEventBus();
    synchronizer = new TargetModeSynchronizer({
      sessionContext: {
        getContext: () => {
          if (!cached) throw ErrorCatalog.createError('SESSION_NOT_FOUND');
          return { mode: cached };
        },
        bootstrap,
      },
      sessionRepository,
      competitionRepository,
      competitionInterruptionControl: interruptions,
      target: { sendMode },
    });
    synchronizer.subscribe(eventBus);
  });

  const emitStageAdvanced = (): void =>
    eventBus.emit({
      type: 'StageAdvanced',
      timestamp: Date.now(),
      aggregateId: 'competition-1',
      previousStageIndex: 0,
      newStageIndex: 1,
      stageName: 'Match',
      scored: true,
    });

  const emitPhaseChanged = (previousPhase: 'IDLE' | 'SERIES_COMPLETE', newPhase: 'ACTIVE' | 'FINISHED'): void =>
    eventBus.emit({
      type: 'PhaseChanged',
      timestamp: Date.now(),
      aggregateId: 'competition-1',
      previousPhase,
      newPhase,
      stageIndex: 0,
      seriesIndex: 0,
      stageName: 'Match',
      scored: true,
    });

  const emitProgress = (): void =>
    eventBus.emit({
      type: 'CompetitionProgressChanged',
      timestamp: Date.now(),
      aggregateId: 'competition-1',
      stageIndex: 0,
      seriesIndex: 0,
      shotCount: 1,
    });

  const emitShotRecorded = (mode: Mode, athleteModeObserved: boolean): void =>
    eventBus.emit({
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-1',
      shot: {
        mode,
        competitionContext: athleteModeObserved ? { athleteModeObserved: true } : undefined,
      },
      scoringMode: 'DECIMAL',
    } as never);

  describe('currentMode()', () => {
    it('returns the cached mode', () => {
      cached = Mode.match();
      expect(synchronizer.currentMode()).toEqual(Mode.match());
    });

    it('falls back to Sighting before a session is known', () => {
      cached = null;
      expect(synchronizer.currentMode()).toEqual(Mode.sighting());
    });
  });

  describe('refresh triggers', () => {
    it('reloads with the repositories and sends an unchanged mode at a stage boundary', async () => {
      emitStageAdvanced();

      await synchronizer.settled();
      expect(bootstrap).toHaveBeenCalledWith(sessionRepository, competitionRepository, interruptions);
      expect(sentModes(sendMode)).toEqual(['SIGHTING']);
    });

    it('sends an unchanged mode when the first stage starts', async () => {
      emitPhaseChanged('IDLE', 'ACTIVE');

      await synchronizer.settled();
      expect(sentModes(sendMode)).toEqual(['SIGHTING']);
    });

    it.each([
      ['a noninitial phase change', () => emitPhaseChanged('SERIES_COMPLETE', 'ACTIVE')],
      ['a non-ACTIVE phase change', () => emitPhaseChanged('IDLE', 'FINISHED')],
      ['progress', emitProgress],
      [
        'a completed series',
        (bus: IEventBus) =>
          bus.emit({
            type: 'SeriesCompleted',
            timestamp: Date.now(),
            aggregateId: 'competition-1',
            stageIndex: 0,
            seriesIndex: 0,
            shotCount: 10,
          }),
      ],
      ['an athlete Sighting shot', () => emitShotRecorded(Mode.sighting(), true)],
    ] as const)('after %s, sends only a changed mode', async (_, emit) => {
      emit(eventBus);
      await synchronizer.settled();
      expect(bootstrap).toHaveBeenCalledTimes(1);
      expect(sendMode).not.toHaveBeenCalled();

      persist(Mode.match());
      emit(eventBus);
      await synchronizer.settled();
      expect(sentModes(sendMode)).toEqual(['MATCH']);
    });

    it.each([
      ['a Match shot', Mode.match(), true],
      ['a shot without an athlete selection', Mode.sighting(), false],
    ] as const)('does not refresh after %s', async (_, mode, observed) => {
      emitShotRecorded(mode, observed);

      await synchronizer.settled();
      expect(bootstrap).not.toHaveBeenCalled();
    });

    it('sends nothing when a newer event already set the mode', async () => {
      persist(null);
      emitStageAdvanced();

      await synchronizer.settled();
      expect(sendMode).not.toHaveBeenCalled();
    });
  });

  describe('refresh queue', () => {
    it('runs refreshes one at a time in order', async () => {
      const first = deferred<Mode | null>();
      persist(Mode.match());
      bootstrap.mockImplementationOnce(() => first.promise);

      emitStageAdvanced();
      emitStageAdvanced();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(bootstrap).toHaveBeenCalledTimes(1);

      first.resolve(Mode.sighting());
      await synchronizer.settled();
      expect(bootstrap).toHaveBeenCalledTimes(2);
      expect(sentModes(sendMode)).toEqual(['SIGHTING', 'MATCH']);
    });

    it('logs a failed refresh and keeps the queue running', async () => {
      persist(Mode.match());
      bootstrap.mockRejectedValueOnce(new Error('read failed'));

      emitStageAdvanced();
      emitStageAdvanced();
      await synchronizer.settled();

      expect(warn).toHaveBeenCalledWith('Failed to refresh competition target mode', 'main', { err: 'read failed' });
      expect(sentModes(sendMode)).toEqual(['MATCH']);
    });

    it('logs a failed device write during a refresh', async () => {
      sendMode.mockRejectedValueOnce(new Error('USB write failed'));
      emitStageAdvanced();

      await synchronizer.settled();
      expect(warn).toHaveBeenCalledWith('Failed to refresh competition target mode', 'main', {
        err: 'USB write failed',
      });
    });

    it('settles only after the refreshes queued before it', async () => {
      const pending = deferred<Mode | null>();
      bootstrap.mockImplementationOnce(() => pending.promise);
      emitStageAdvanced();

      let settled = false;
      const waiting = synchronizer.settled().then(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(settled).toBe(false);

      pending.resolve(Mode.match());
      await waiting;
      expect(sentModes(sendMode)).toEqual(['MATCH']);
    });
  });

  describe('mode events', () => {
    it.each(['ModeSwitched', 'AthleteTargetModeChanged'] as const)(
      'sends %s at once, even while a refresh is pending',
      async (type) => {
        const pending = deferred<Mode | null>();
        bootstrap.mockImplementationOnce(() => pending.promise);
        emitStageAdvanced();

        eventBus.emit({
          type,
          timestamp: Date.now(),
          aggregateId: 'session-1',
          previousMode: Mode.sighting(),
          newMode: Mode.match(),
        } as never);

        expect(sentModes(sendMode)).toEqual(['MATCH']);
        pending.resolve(null);
        await synchronizer.settled();
        expect(sentModes(sendMode)).toEqual(['MATCH']);
      },
    );

    it.each(['ModeSwitched', 'AthleteTargetModeChanged'] as const)('logs a failed %s write', async (type) => {
      sendMode.mockRejectedValueOnce(new Error('USB write failed'));

      eventBus.emit({
        type,
        timestamp: Date.now(),
        aggregateId: 'session-1',
        previousMode: Mode.sighting(),
        newMode: Mode.match(),
      } as never);

      await vi.waitFor(() =>
        expect(warn).toHaveBeenCalledWith(`sendMode failed on ${type}`, 'main', {
          mode: 'MATCH',
          err: 'USB write failed',
        }),
      );
    });
  });

  describe('restoreAfterReconnect()', () => {
    it('waits for a pending refresh, then sends the cached mode', async () => {
      const pending = deferred<Mode | null>();
      bootstrap.mockImplementationOnce(async () => {
        const mode = await pending.promise;
        cached = mode;
        return mode;
      });
      emitStageAdvanced();

      const restored = synchronizer.restoreAfterReconnect();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(sendMode).not.toHaveBeenCalled();

      pending.resolve(Mode.match());
      await restored;
      expect(sentModes(sendMode)).toEqual(['MATCH', 'MATCH']);
    });

    it('logs a failed write without rejecting', async () => {
      sendMode.mockRejectedValueOnce(new Error('USB write failed'));

      await expect(synchronizer.restoreAfterReconnect()).resolves.toBeUndefined();
      await vi.waitFor(() =>
        expect(warn).toHaveBeenCalledWith('Failed to restore device mode after automatic USB reconnect', 'main', {
          err: 'USB write failed',
        }),
      );
    });
  });
});
