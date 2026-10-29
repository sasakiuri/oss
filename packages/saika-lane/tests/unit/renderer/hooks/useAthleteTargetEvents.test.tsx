// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAthleteTargetEvents } from '@/renderer/presentation/hooks/useAthleteTargetEvents';
import { selectAthleteTargetMode } from '@/renderer/presentation/stores/athleteTargetControl';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { competitionService } from '@/renderer/services/competitionService';
import type { CompetitionStateDto } from '@/shared/ipc/contracts';

vi.mock('@/renderer/services/competitionService', () => ({
  competitionService: { getCompetitionState: vi.fn(), setAthleteTargetMode: vi.fn() },
}));
const phase = vi.fn();
const progress = vi.fn();
const shot = vi.fn();
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
    athleteTargetControl: { sightingAllowed: true, matchAllowed: true, selected: null, effective },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  useCompetitionStore.getState().resetCompetition();
  useCompetitionStore.setState({ competitionId: 'comp-1', phase: 'ACTIVE', stageIndex: 1, seriesIndex: 2 });
  for (const subscribe of [phase, progress, shot]) subscribe.mockReturnValue(unsubscribe);
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { on: { phaseChanged: phase, competitionProgressChanged: progress, shotRecorded: shot } },
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
    expect(unsubscribe).toHaveBeenCalledTimes(3);
  });
});
