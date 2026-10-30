// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAthleteTargetEvents } from '@/renderer/presentation/hooks/useAthleteTargetEvents';
import { localProgressControls } from '@/renderer/presentation/policies/localProgressControls';
import {
  refreshAthleteTargetControl,
  selectAthleteTargetMode,
} from '@/renderer/presentation/stores/athleteTargetControl';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { competitionService } from '@/renderer/services/competitionService';
import type { CompetitionStateDto } from '@/shared/ipc/contracts';

vi.mock('@/renderer/services/competitionService', () => ({
  competitionService: { getCompetitionState: vi.fn(), setAthleteTargetMode: vi.fn() },
}));
const phase = vi.fn();
const progress = vi.fn();
const shot = vi.fn();
const interruption = vi.fn();
const unsubscribe = vi.fn();
function dto(series = 2, effective: 'SIGHTING' | 'MATCH' = 'MATCH'): CompetitionStateDto {
  return {
    id: 'comp-1',
    sessionId: 'session-1',
    phase: 'ACTIVE',
    currentStageIndex: 1,
    currentSeriesIndex: series,
    seriesShotCount: 0,
    timer: { remainingSeconds: 600, totalSeconds: 1000, formattedRemaining: '10:00', isExpired: false },
    currentStageName: 'Match',
    scored: true,
    shotsPerSeries: 10,
    acc: 'DECIMAL',
    interruption: null,
    athleteTargetControl: {
      officialSighting: false,
      sightingAllowed: true,
      matchAllowed: true,
      matchUnavailableReason: null,
      selected: null,
      effective,
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.clearAllMocks();
  useCompetitionStore.getState().resetCompetition();
  useCompetitionStore.setState({ competitionId: 'comp-1', phase: 'ACTIVE', stageIndex: 1, seriesIndex: 2 });
  for (const subscribe of [phase, progress, shot, interruption]) subscribe.mockReturnValue(unsubscribe);
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      on: {
        phaseChanged: phase,
        competitionProgressChanged: progress,
        shotRecorded: shot,
        positionExtraNullified: vi.fn(() => unsubscribe),
        competitionInterruptionChanged: interruption,
      },
    },
  });
  vi.mocked(competitionService.getCompetitionState).mockResolvedValue(dto());
});

describe('athlete projection refresh', () => {
  it('refreshes on phase, same-phase progress and shots, discarding older responses', async () => {
    const old = deferred<CompetitionStateDto>();
    vi.mocked(competitionService.getCompetitionState).mockReturnValueOnce(old.promise);
    renderHook(() => useAthleteTargetEvents());
    await act(async () => {
      shot.mock.calls[0]![0]({ sessionId: 'session-1' });
    });
    expect(useCompetitionStore.getState().athleteTargetControl?.effective).toBe('MATCH');
    vi.mocked(competitionService.getCompetitionState).mockResolvedValue(dto(3, 'SIGHTING'));
    await act(async () => {
      progress.mock.calls[0]![0]({ competitionId: 'comp-1', stageIndex: 1, seriesIndex: 3, shotCount: 0 });
    });
    expect(useCompetitionStore.getState().seriesIndex).toBe(3);
    expect(useCompetitionStore.getState().athleteTargetControl?.effective).toBe('SIGHTING');
    await act(async () => {
      old.resolve(dto(2));
    });
    expect(useCompetitionStore.getState().athleteTargetControl?.effective).toBe('SIGHTING');
    const calls = vi.mocked(competitionService.getCompetitionState).mock.calls.length;
    await act(async () => {
      phase.mock.calls[0]![0]({});
    });
    expect(competitionService.getCompetitionState).toHaveBeenCalledTimes(calls + 1);
    await act(async () => {
      interruption.mock.calls[0]![0]({ competitionId: 'comp-1' });
    });
    expect(competitionService.getCompetitionState).toHaveBeenCalledTimes(calls + 2);
  });

  it('blocks only the unloaded series and keeps ordinary controls available during later shot queries', async () => {
    const initial = deferred<CompetitionStateDto>();
    vi.mocked(competitionService.getCompetitionState).mockReturnValueOnce(initial.promise);
    renderHook(() => useAthleteTargetEvents());
    expect(useCompetitionStore.getState().athleteTargetControlPending).toBe(true);
    await act(async () => {
      initial.resolve({ ...dto(), athleteTargetControl: null });
    });
    expect(useCompetitionStore.getState().athleteTargetControlLoaded).toBe(true);
    const next = deferred<CompetitionStateDto>();
    vi.mocked(competitionService.getCompetitionState).mockReturnValueOnce(next.promise);
    await act(async () => {
      shot.mock.calls[0]![0]({ sessionId: 'session-1' });
    });
    const current = useCompetitionStore.getState();
    expect(current.athleteTargetControlPending).toBe(false);
    const membership = { membership: { competitionId: null, revision: 0 }, hydrated: true, hydrationFailed: false };
    expect(localProgressControls(membership, 'match', current).allowed).toBe(true);
    expect(localProgressControls(membership, 'sighting', current).allowed).toBe(true);
    await act(async () => {
      next.reject(new Error('query failed'));
    });
    expect(useCompetitionStore.getState().athleteTargetControlPending).toBe(false);
    expect(localProgressControls(membership, 'match', useCompetitionStore.getState()).allowed).toBe(true);
  });

  it('clears pending when the latest initial query fails or its response is discarded', async () => {
    vi.mocked(competitionService.getCompetitionState).mockRejectedValueOnce(new Error('query failed'));
    await act(async () => {
      await refreshAthleteTargetControl();
    });
    expect(useCompetitionStore.getState().athleteTargetControlPending).toBe(false);
    const next = deferred<CompetitionStateDto>();
    vi.mocked(competitionService.getCompetitionState).mockReturnValueOnce(next.promise);
    const request = refreshAthleteTargetControl();
    expect(useCompetitionStore.getState().athleteTargetControlPending).toBe(true);
    await act(async () => {
      next.resolve(dto(99));
      await request;
    });
    expect(useCompetitionStore.getState().athleteTargetControlPending).toBe(false);
    expect(useCompetitionStore.getState().athleteTargetControl).toBeNull();
  });

  it('keeps failed controls unavailable and recovers on the next relevant notification', async () => {
    vi.mocked(competitionService.getCompetitionState).mockRejectedValueOnce(new Error('unavailable'));
    await act(async () => {
      renderHook(() => useAthleteTargetEvents());
    });
    const membership = { membership: { competitionId: null, revision: 0 }, hydrated: true, hydrationFailed: false };
    expect(useCompetitionStore.getState().athleteTargetControlPending).toBe(false);
    expect(localProgressControls(membership, 'sighting', useCompetitionStore.getState()).allowed).toBe(false);
    expect(localProgressControls(membership, 'match', useCompetitionStore.getState()).allowed).toBe(false);
    vi.mocked(competitionService.getCompetitionState).mockResolvedValue(dto());
    await act(async () => {
      interruption.mock.calls[0]![0]({ competitionId: 'comp-1' });
    });
    expect(localProgressControls(membership, 'sighting', useCompetitionStore.getState()).allowed).toBe(true);
    expect(useCompetitionStore.getState().athleteTargetControlLoaded).toBe(true);
  });

  it('invalidates a cached ordinary capability when a latest response has different coordinates', async () => {
    useCompetitionStore.getState().setAthleteTargetControl(null);
    vi.mocked(competitionService.getCompetitionState).mockResolvedValueOnce(dto(99));
    await act(async () => {
      await refreshAthleteTargetControl();
    });
    expect(useCompetitionStore.getState().athleteTargetControlLoaded).toBe(false);
    const membership = { membership: { competitionId: null, revision: 0 }, hydrated: true, hydrationFailed: false };
    expect(localProgressControls(membership, 'sighting', useCompetitionStore.getState()).allowed).toBe(false);
  });

  it('does not clear pending from an older request while the new series query is running', async () => {
    const old = deferred<CompetitionStateDto>();
    const next = deferred<CompetitionStateDto>();
    vi.mocked(competitionService.getCompetitionState)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise);
    renderHook(() => useAthleteTargetEvents());
    await act(async () => {
      useCompetitionStore.getState().advanceSeries(3);
    });
    await act(async () => {
      old.resolve(dto());
    });
    expect(useCompetitionStore.getState().athleteTargetControlPending).toBe(true);
    await act(async () => {
      next.resolve(dto(3));
    });
    expect(useCompetitionStore.getState().athleteTargetControlPending).toBe(false);
    expect(useCompetitionStore.getState().athleteTargetControlLoaded).toBe(true);
  });

  it('refetches after a rejected selection so a newly reached cutoff disables Sighting', async () => {
    await act(async () => {
      renderHook(() => useAthleteTargetEvents());
    });
    vi.mocked(competitionService.setAthleteTargetMode).mockRejectedValueOnce(new Error('ATHLETE_SIGHTING_CLOSED'));
    vi.mocked(competitionService.getCompetitionState).mockResolvedValue({
      ...dto(),
      seriesShotCount: 1,
      acc: 'DECIMAL',
      interruption: null,
      athleteTargetControl: {
        officialSighting: false,
        sightingAllowed: false,
        matchAllowed: true,
        matchUnavailableReason: null,
        selected: null,
        effective: 'MATCH',
      },
    });
    await act(async () => {
      await selectAthleteTargetMode('SIGHTING');
    });
    expect(competitionService.getCompetitionState).toHaveBeenCalledTimes(2);
    expect(useCompetitionStore.getState().athleteTargetControl).toMatchObject({
      sightingAllowed: false,
      effective: 'MATCH',
    });
    expect(useCompetitionStore.getState().athleteTargetControlPending).toBe(false);
  });

  it('preserves the loaded capability on same-position phase notifications', async () => {
    await act(async () => {
      renderHook(() => useAthleteTargetEvents());
    });
    const control = useCompetitionStore.getState().athleteTargetControl;
    await act(async () => {
      useCompetitionStore.getState().applyPhaseChange('ACTIVE', 1, 2, 'Match', true);
    });
    expect(useCompetitionStore.getState().athleteTargetControl).toBe(control);
    expect(useCompetitionStore.getState().athleteTargetControlLoaded).toBe(true);
  });

  it('discards a delayed query after a newer command response', async () => {
    const old = deferred<CompetitionStateDto>();
    vi.mocked(competitionService.getCompetitionState).mockReturnValueOnce(old.promise);
    renderHook(() => useAthleteTargetEvents());
    vi.mocked(competitionService.setAthleteTargetMode).mockResolvedValue(dto(2, 'SIGHTING'));
    await act(async () => {
      await selectAthleteTargetMode('SIGHTING');
    });
    await act(async () => {
      old.resolve(dto());
    });
    expect(useCompetitionStore.getState().athleteTargetControl?.effective).toBe('SIGHTING');
  });

  it('discards responses after teardown and ignores another competition progress', async () => {
    const pending = deferred<CompetitionStateDto>();
    vi.mocked(competitionService.getCompetitionState).mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useAthleteTargetEvents());
    progress.mock.calls[0]![0]({ competitionId: 'other', stageIndex: 1, seriesIndex: 3 });
    expect(competitionService.getCompetitionState).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      pending.resolve(dto());
    });
    expect(useCompetitionStore.getState().athleteTargetControl).toBeNull();
    expect(unsubscribe).toHaveBeenCalledTimes(5);
  });
});
