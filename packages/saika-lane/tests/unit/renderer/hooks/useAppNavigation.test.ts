// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useAppNavigation } from '@/renderer/presentation/hooks/useAppNavigation';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import type { StartupStateDto } from '@/shared/ipc/contracts';

import { createMockElectronAPI } from '../../../helpers/mockElectronAPI';

const ready: StartupStateDto = {
  status: 'READY',
  error: null,
  competitionId: 'saved',
  sessionId: 'session',
  currentSeriesStartIndex: 10,
  canFinish: true,
};
let api: ReturnType<typeof createMockElectronAPI>;
const data = <T>(value: T) => ({ success: true, data: value });
const competition = {
  id: 'saved',
  sessionId: 'session',
  phase: 'SERIES_COMPLETE',
  currentStageIndex: 1,
  currentSeriesIndex: 0,
  currentStageName: 'Match',
  scored: true,
  shotsPerSeries: 10,
  acc: 'RING',
  athleteTargetControl: null,
  interruption: {
    status: 'PAUSED',
    interruptionId: 'hold',
    remainingSeconds: 4000,
    unlimitedSightingShots: false,
    restartHold: true,
  },
  timer: { remainingSeconds: 4000, totalSeconds: 4500, isExpired: false },
};

beforeEach(() => {
  vi.useFakeTimers();
  useSessionStore.getState().resetSession();
  useCompetitionStore.getState().resetCompetition();
  api = createMockElectronAPI();
  window.electronAPI = api as unknown as typeof window.electronAPI;
  api.startup.getStartupState.mockResolvedValue(data(ready));
  api.startup.retryStartup.mockResolvedValue(data(ready));
  api.competition.getCompetitionState.mockResolvedValue(data(competition));
  api.queries.getShotHistory.mockResolvedValue(data({ shots: [], nullifiedExtras: [] }));
  api.queries.getSessionScore.mockResolvedValue(
    data({ discipline: 'AIR_RIFLE_10M', mode: 'MATCH', totalScore: 1000, seriesScores: [1000] }),
  );
});
afterEach(() => vi.useRealTimers());

it('keeps the minimum splash and hydrates the saved position without creating a run', async () => {
  const { result } = renderHook(() => useAppNavigation());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1999);
  });
  expect(result.current.screen).toBe('splash');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(result.current.screen).toBe('main');
  expect(useCompetitionStore.getState()).toMatchObject({
    competitionId: 'saved',
    phase: 'SERIES_COMPLETE',
    stageIndex: 1,
    acc: 'RING',
    interruption: { status: 'PAUSED' },
    isTimerRunning: false,
  });
  expect(useSessionStore.getState()).toMatchObject({
    currentSessionId: 'session',
    discipline: 'AIR_RIFLE_10M',
    currentSeriesStartIndex: 10,
  });
  expect(api.competition.startCompetition).not.toHaveBeenCalled();
});

it('waits for main readiness even after two seconds', async () => {
  let resolve!: (value: unknown) => void;
  api.startup.getStartupState.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { result } = renderHook(() => useAppNavigation());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(result.current.screen).toBe('splash');
  await act(async () => {
    resolve(data(ready));
  });
  expect(result.current.screen).toBe('main');
});

it.each([false, true])('hydrates the actual clock running state between series (running=%s)', async (running) => {
  api.competition.getCompetitionState.mockResolvedValue(
    data({ ...competition, interruption: null, timer: { ...competition.timer, running } }),
  );
  renderHook(() => useAppNavigation());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(useCompetitionStore.getState().isTimerRunning).toBe(running);
  expect(useCompetitionStore.getState().waitingForDirector).toBe(!running);
});

it('subscribes before queries and re-queries once when a phase event races hydration', async () => {
  let phaseChanged!: () => void;
  api.on.phaseChanged.mockImplementation((listener) => {
    phaseChanged = listener;
    return vi.fn();
  });
  api.competition.getCompetitionState
    .mockImplementationOnce(async () => {
      phaseChanged();
      return data(competition);
    })
    .mockResolvedValue(data({ ...competition, phase: 'STAGE_COMPLETE' }));
  const { result } = renderHook(() => useAppNavigation());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(result.current.screen).toBe('main');
  expect(api.competition.getCompetitionState).toHaveBeenCalledTimes(2);
  expect(useCompetitionStore.getState().phase).toBe('STAGE_COMPLETE');
  expect(api.on.phaseChanged.mock.invocationCallOrder[0]).toBeLessThan(
    api.startup.getStartupState.mock.invocationCallOrder[0]!,
  );
});

it('shows ERROR and retries using main rather than renderer creation', async () => {
  api.startup.getStartupState.mockResolvedValue(
    data({ ...ready, status: 'ERROR', error: 'membership mismatch', canFinish: false }),
  );
  const { result } = renderHook(() => useAppNavigation());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(result.current.screen).toBe('recovery');
  await act(async () => {
    await result.current.retry();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(result.current.screen).toBe('main');
  expect(api.startup.retryStartup).toHaveBeenCalledTimes(1);
  expect(api.competition.startCompetition).not.toHaveBeenCalled();
});
