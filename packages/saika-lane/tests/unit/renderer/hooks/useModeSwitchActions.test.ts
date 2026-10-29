// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useModeSwitchActions } from '@/renderer/presentation/hooks/useModeSwitchActions';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import type { ShotDto } from '@/shared/ipc/contracts';

const mockSwitchMode = vi.fn().mockResolvedValue(undefined);
const mockStartStage = vi.fn().mockResolvedValue({ sessionId: 'session-1' });
const mockStartNextSeries = vi.fn().mockResolvedValue(undefined);
const mockAdvanceStage = vi.fn().mockResolvedValue(undefined);
const mockEndStage = vi.fn().mockResolvedValue(undefined);

vi.mock('@/renderer/presentation/hooks/useSession', () => ({
  useSession: () => ({
    switchMode: mockSwitchMode,
    currentSessionId: 'session-1',
    mode: 'SIGHTING',
    totalScore: 0,
    seriesScores: [],
    startSession: vi.fn(),
    resetSession: vi.fn(),
    isStarting: false,
    isSwitching: false,
    isResetting: false,
    error: null,
  }),
}));

vi.mock('@/renderer/presentation/hooks/useCompetition', () => ({
  useCompetition: () => ({
    startStage: mockStartStage,
    startNextSeries: mockStartNextSeries,
    advanceStage: mockAdvanceStage,
    endStage: mockEndStage,
    startCompetition: vi.fn(),
    finishCompetition: vi.fn(),
    loading: false,
    error: null,
  }),
}));

function setCompetitionState(overrides: Partial<{ competitionId: string | null; phase: string; scored: boolean }>) {
  const state = useCompetitionStore.getState();
  if (overrides.competitionId !== undefined) {
    state.setCompetitionId(overrides.competitionId);
  }
  if (overrides.phase !== undefined) {
    state.setPhase(overrides.phase as 'IDLE', 0, 0, '', false);
  }
  if (overrides.scored !== undefined) {
    state.advanceStage(0, '', overrides.scored);
  }
}

describe('useModeSwitchActions (3-button model)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCompetitionStore.getState().resetCompetition();
    useSessionStore.getState().resetSession();
  });

  describe('handlePreparationClick', () => {
    it('calls startStage during competition', async () => {
      setCompetitionState({ competitionId: 'comp-1', phase: 'ACTIVE' });

      const { result } = renderHook(() => useModeSwitchActions());

      await act(async () => {
        await result.current.handlePreparationClick();
      });

      expect(mockStartStage).toHaveBeenCalledWith('comp-1');
      expect(mockSwitchMode).not.toHaveBeenCalled();
      expect(useSessionStore.getState().preparationShotNumberResetIndices).toEqual([0]);
    });

    it('calls switchMode("SIGHTING") when not in competition', async () => {
      const { result } = renderHook(() => useModeSwitchActions());

      await act(async () => {
        await result.current.handlePreparationClick();
      });

      expect(mockSwitchMode).toHaveBeenCalledWith('SIGHTING');
      expect(mockStartStage).not.toHaveBeenCalled();
      expect(useSessionStore.getState().preparationShotNumberResetIndices).toEqual([0]);
    });

    it('treats phase FINISHED as non-competition and calls switchMode', async () => {
      setCompetitionState({ competitionId: 'comp-1', phase: 'FINISHED' });

      const { result } = renderHook(() => useModeSwitchActions());

      await act(async () => {
        await result.current.handlePreparationClick();
      });

      expect(mockSwitchMode).toHaveBeenCalledWith('SIGHTING');
      expect(mockStartStage).not.toHaveBeenCalled();
      expect(useSessionStore.getState().preparationShotNumberResetIndices).toEqual([0]);
    });

    it('does not throw when startStage fails', async () => {
      setCompetitionState({ competitionId: 'comp-1', phase: 'ACTIVE' });
      mockStartStage.mockRejectedValueOnce(new Error('fail'));

      const { result } = renderHook(() => useModeSwitchActions());

      await expect(
        act(async () => {
          await result.current.handlePreparationClick();
        }),
      ).resolves.not.toThrow();
      expect(useSessionStore.getState().preparationShotNumberResetIndices).toEqual([]);
    });
  });

  describe('handleMatchClick', () => {
    it('calls startNextSeries when phase is SERIES_COMPLETE', async () => {
      setCompetitionState({ competitionId: 'comp-1', phase: 'SERIES_COMPLETE' });

      const { result } = renderHook(() => useModeSwitchActions());

      await act(async () => {
        await result.current.handleMatchClick();
      });

      expect(mockStartNextSeries).toHaveBeenCalledWith('comp-1');
    });

    it('calls startNextSeries when phase is SERIES_ENTERED', async () => {
      setCompetitionState({ competitionId: 'comp-1', phase: 'SERIES_ENTERED' });

      const { result } = renderHook(() => useModeSwitchActions());

      await act(async () => {
        await result.current.handleMatchClick();
      });

      expect(mockStartNextSeries).toHaveBeenCalledWith('comp-1');
    });

    it('calls startNextSeries when phase is STAGE_ENTERED', async () => {
      setCompetitionState({ competitionId: 'comp-1', phase: 'STAGE_ENTERED' });

      const { result } = renderHook(() => useModeSwitchActions());

      await act(async () => {
        await result.current.handleMatchClick();
      });

      expect(mockStartNextSeries).toHaveBeenCalledWith('comp-1');
    });

    it('calls switchMode("MATCH") when not in competition', async () => {
      const { result } = renderHook(() => useModeSwitchActions());

      await act(async () => {
        await result.current.handleMatchClick();
      });

      expect(mockSwitchMode).toHaveBeenCalledWith('MATCH');
      expect(mockStartNextSeries).not.toHaveBeenCalled();
    });

    it('calls endStage, advanceStage, startNextSeries in order when ACTIVE[!scored]', async () => {
      setCompetitionState({ competitionId: 'comp-1', phase: 'ACTIVE', scored: false });

      const { result } = renderHook(() => useModeSwitchActions());

      await act(async () => {
        await result.current.handleMatchClick();
      });

      expect(mockEndStage).toHaveBeenCalledWith('comp-1');
      expect(mockAdvanceStage).toHaveBeenCalledWith('comp-1');
      expect(mockStartNextSeries).toHaveBeenCalledWith('comp-1');

      // Verify call order
      const endStageOrder = mockEndStage.mock.invocationCallOrder[0]!;
      const advanceOrder = mockAdvanceStage.mock.invocationCallOrder[0]!;
      const startNextSeriesOrder = mockStartNextSeries.mock.invocationCallOrder[0]!;
      expect(endStageOrder).toBeLessThan(advanceOrder);
      expect(advanceOrder).toBeLessThan(startNextSeriesOrder);
    });

    it('does nothing when ACTIVE[scored]', async () => {
      setCompetitionState({ competitionId: 'comp-1', phase: 'ACTIVE', scored: true });

      const { result } = renderHook(() => useModeSwitchActions());

      await act(async () => {
        await result.current.handleMatchClick();
      });

      expect(mockStartNextSeries).not.toHaveBeenCalled();
      expect(mockEndStage).not.toHaveBeenCalled();
      expect(mockAdvanceStage).not.toHaveBeenCalled();
      expect(mockSwitchMode).not.toHaveBeenCalled();
    });

    it('treats phase FINISHED as non-competition and calls switchMode', async () => {
      setCompetitionState({ competitionId: 'comp-1', phase: 'FINISHED' });

      const { result } = renderHook(() => useModeSwitchActions());

      await act(async () => {
        await result.current.handleMatchClick();
      });

      expect(mockSwitchMode).toHaveBeenCalledWith('MATCH');
      expect(mockStartNextSeries).not.toHaveBeenCalled();
    });
  });

  describe('handleNextStageClick', () => {
    it('calls endStage when phase is ACTIVE + scored false', async () => {
      setCompetitionState({ competitionId: 'comp-1', phase: 'ACTIVE', scored: false });

      const { result } = renderHook(() => useModeSwitchActions());

      await act(async () => {
        await result.current.handleNextStageClick();
      });

      expect(mockEndStage).toHaveBeenCalledWith('comp-1');
    });

    it('calls advanceStage when phase is SERIES_COMPLETE', async () => {
      setCompetitionState({ competitionId: 'comp-1', phase: 'SERIES_COMPLETE' });

      const { result } = renderHook(() => useModeSwitchActions());

      await act(async () => {
        await result.current.handleNextStageClick();
      });

      expect(mockAdvanceStage).toHaveBeenCalledWith('comp-1');
    });

    it('does nothing when not in competition', async () => {
      const { result } = renderHook(() => useModeSwitchActions());

      await act(async () => {
        await result.current.handleNextStageClick();
      });

      expect(mockEndStage).not.toHaveBeenCalled();
      expect(mockAdvanceStage).not.toHaveBeenCalled();
    });

    it('does nothing when phase is IDLE', async () => {
      setCompetitionState({ competitionId: 'comp-1', phase: 'IDLE' });

      const { result } = renderHook(() => useModeSwitchActions());

      await act(async () => {
        await result.current.handleNextStageClick();
      });

      expect(mockEndStage).not.toHaveBeenCalled();
      expect(mockAdvanceStage).not.toHaveBeenCalled();
    });

    it('does nothing when phase is ACTIVE + scored true', async () => {
      setCompetitionState({ competitionId: 'comp-1', phase: 'ACTIVE', scored: true });

      const { result } = renderHook(() => useModeSwitchActions());

      await act(async () => {
        await result.current.handleNextStageClick();
      });

      expect(mockEndStage).not.toHaveBeenCalled();
      expect(mockAdvanceStage).not.toHaveBeenCalled();
    });

    it('does nothing when phase is FINISHED', async () => {
      setCompetitionState({ competitionId: 'comp-1', phase: 'FINISHED' });

      const { result } = renderHook(() => useModeSwitchActions());

      await act(async () => {
        await result.current.handleNextStageClick();
      });

      expect(mockEndStage).not.toHaveBeenCalled();
      expect(mockAdvanceStage).not.toHaveBeenCalled();
    });

    it('does not throw when endStage fails', async () => {
      setCompetitionState({ competitionId: 'comp-1', phase: 'ACTIVE', scored: false });
      mockEndStage.mockRejectedValueOnce(new Error('fail'));

      const { result } = renderHook(() => useModeSwitchActions());

      await expect(
        act(async () => {
          await result.current.handleNextStageClick();
        }),
      ).resolves.not.toThrow();
    });
  });
});

const shot: ShotDto = {
  id: 'shot-1',
  shotNumber: 1,
  seriesNumber: 0,
  x: 0,
  y: 0,
  score: 100,
  innerTen: false,
  timestamp: '2026-10-29T00:00:00Z',
  mode: 'SIGHTING',
  isRecorded: false,
};

describe('mode change confirmation rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCompetitionStore.getState().resetCompetition();
    useSessionStore.getState().resetSession();
    useSessionStore.getState().setSessionId('session-1');
  });

  it.each([
    {
      phase: 'ACTIVE',
      message: 'End this session and wait to start again? The current session will be saved as finished.',
    },
    ...['SERIES_COMPLETE', 'SERIES_ENTERED', 'STAGE_ENTERED'].map((phase) => ({
      phase,
      message: 'End this session and start the first stage again? The current session will be saved as finished.',
    })),
  ])('confirms Preparation in $phase with shots in an earlier series', async ({ phase, message }) => {
    setCompetitionState({ competitionId: 'comp-1', phase });
    useSessionStore.getState().addShot(shot);
    useSessionStore.getState().setCurrentSeriesStartIndex(1);
    const { result } = renderHook(() => useModeSwitchActions());

    await act(async () => {
      await result.current.handlePreparationClick();
    });
    expect(result.current.confirmation?.message).toBe(message);
    expect(mockStartStage).not.toHaveBeenCalled();
    expect(useSessionStore.getState().preparationShotNumberResetIndices).toEqual([]);

    await act(async () => {
      await result.current.confirm();
    });
    expect(mockStartStage).toHaveBeenCalledExactlyOnceWith('comp-1');
    expect(useSessionStore.getState().preparationShotNumberResetIndices).toEqual([1]);
    expect(result.current.confirmation).toBeNull();
  });

  it.each(['ACTIVE', 'SERIES_COMPLETE', 'SERIES_ENTERED', 'STAGE_ENTERED'])(
    'runs Preparation immediately in %s without shots',
    async (phase) => {
      setCompetitionState({ competitionId: 'comp-1', phase });
      const { result } = renderHook(() => useModeSwitchActions());
      await act(async () => {
        await result.current.handlePreparationClick();
      });
      expect(result.current.confirmation).toBeNull();
      expect(mockStartStage).toHaveBeenCalledExactlyOnceWith('comp-1');
    },
  );

  it('starts IDLE immediately even if the session contains shots', async () => {
    setCompetitionState({ competitionId: 'comp-1', phase: 'IDLE' });
    useSessionStore.getState().addShot(shot);
    const { result } = renderHook(() => useModeSwitchActions());
    await act(async () => {
      await result.current.handlePreparationClick();
    });
    expect(result.current.confirmation).toBeNull();
    expect(mockStartStage).toHaveBeenCalledExactlyOnceWith('comp-1');
  });

  it('confirms Match when ending preparation with shots', async () => {
    setCompetitionState({ competitionId: 'comp-1', phase: 'ACTIVE', scored: false });
    useSessionStore.getState().addShot(shot);
    const { result } = renderHook(() => useModeSwitchActions());
    await act(async () => {
      await result.current.handleMatchClick();
    });
    expect(result.current.confirmation?.message).toBe('End preparation and start the match?');
    expect(mockEndStage).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.confirm();
    });
    expect(mockEndStage).toHaveBeenCalledExactlyOnceWith('comp-1');
    expect(mockAdvanceStage).toHaveBeenCalledExactlyOnceWith('comp-1');
    expect(mockStartNextSeries).toHaveBeenCalledExactlyOnceWith('comp-1');
    expect(mockEndStage.mock.invocationCallOrder[0]).toBeLessThan(mockAdvanceStage.mock.invocationCallOrder[0]!);
    expect(mockAdvanceStage.mock.invocationCallOrder[0]).toBeLessThan(mockStartNextSeries.mock.invocationCallOrder[0]!);
  });

  it('starts Match immediately when only an earlier preparation has shots', async () => {
    setCompetitionState({ competitionId: 'comp-1', phase: 'ACTIVE', scored: false });
    useSessionStore.getState().addShot(shot);
    useSessionStore.getState().setCurrentSeriesStartIndex(1);
    const { result } = renderHook(() => useModeSwitchActions());
    await act(async () => {
      await result.current.handleMatchClick();
    });
    expect(result.current.confirmation).toBeNull();
    expect(mockEndStage).toHaveBeenCalledExactlyOnceWith('comp-1');
  });

  it.each(['SERIES_COMPLETE', 'SERIES_ENTERED', 'STAGE_ENTERED'])(
    'starts the next series in %s without confirmation despite earlier shots',
    async (phase) => {
      setCompetitionState({ competitionId: 'comp-1', phase });
      useSessionStore.getState().addShot(shot);
      const { result } = renderHook(() => useModeSwitchActions());
      await act(async () => {
        await result.current.handleMatchClick();
      });
      expect(result.current.confirmation).toBeNull();
      expect(mockStartNextSeries).toHaveBeenCalledExactlyOnceWith('comp-1');
      expect(mockEndStage).not.toHaveBeenCalled();
    },
  );

  it.each([
    { phase: 'IDLE', scored: false },
    { phase: 'ACTIVE', scored: true },
  ])('leaves Match unchanged in $phase / scored=$scored with shots', async ({ phase, scored }) => {
    setCompetitionState({ competitionId: 'comp-1', phase, scored });
    useSessionStore.getState().addShot(shot);
    const { result } = renderHook(() => useModeSwitchActions());
    await act(async () => {
      await result.current.handleMatchClick();
    });
    expect(result.current.confirmation).toBeNull();
    expect(mockStartNextSeries).not.toHaveBeenCalled();
    expect(mockEndStage).not.toHaveBeenCalled();
    expect(mockSwitchMode).not.toHaveBeenCalled();
  });

  it.each(['handlePreparationClick', 'handleMatchClick'] as const)(
    '%s confirms only when the current series contains shots in the switchMode branch',
    async (action) => {
      useSessionStore.getState().addShot(shot);
      const { result } = renderHook(() => useModeSwitchActions());
      await act(async () => {
        await result.current[action]();
      });
      expect(result.current.confirmation?.message).toContain('Start a new');
      expect(mockSwitchMode).not.toHaveBeenCalled();
      act(() => {
        result.current.cancelConfirmation();
      });
      useSessionStore.getState().setCurrentSeriesStartIndex(1);
      await act(async () => {
        await result.current[action]();
      });
      expect(result.current.confirmation).toBeNull();
      expect(mockSwitchMode).toHaveBeenCalledExactlyOnceWith(
        action === 'handlePreparationClick' ? 'SIGHTING' : 'MATCH',
      );
    },
  );

  it.each(['handlePreparationClick', 'handleMatchClick'] as const)(
    '%s keeps FINISHED immediate without offering confirmation for a finished session',
    async (action) => {
      setCompetitionState({ competitionId: 'comp-1', phase: 'FINISHED' });
      useSessionStore.getState().addShot(shot);
      mockSwitchMode.mockRejectedValueOnce(new Error('Session already finished'));
      const { result } = renderHook(() => useModeSwitchActions());
      await act(async () => {
        await result.current[action]();
      });
      expect(result.current.confirmation).toBeNull();
      expect(mockSwitchMode).toHaveBeenCalledExactlyOnceWith(
        action === 'handlePreparationClick' ? 'SIGHTING' : 'MATCH',
      );
      expect(useSessionStore.getState().preparationShotNumberResetIndices).toEqual([]);
      expect(mockStartStage).not.toHaveBeenCalled();
      expect(mockEndStage).not.toHaveBeenCalled();
      expect(mockAdvanceStage).not.toHaveBeenCalled();
      expect(mockStartNextSeries).not.toHaveBeenCalled();
    },
  );

  it('rechecks state at confirmation before a render or effect can run', async () => {
    setCompetitionState({ competitionId: 'comp-1', phase: 'ACTIVE' });
    useSessionStore.getState().addShot(shot);
    const { result } = renderHook(() => useModeSwitchActions());
    await act(async () => {
      await result.current.handlePreparationClick();
      useSessionStore.getState().setSessionId('session-2');
      await result.current.confirm();
    });
    expect(result.current.confirmation).toBeNull();
    expect(mockStartStage).not.toHaveBeenCalled();
  });
});
