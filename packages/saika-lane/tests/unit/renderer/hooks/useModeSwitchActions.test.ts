// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useModeSwitchActions } from '@/renderer/presentation/hooks/useModeSwitchActions';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';

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
