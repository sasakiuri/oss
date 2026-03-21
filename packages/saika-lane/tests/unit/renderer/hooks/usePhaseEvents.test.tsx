// SPDX-License-Identifier: MIT
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePhaseEvents } from '@/renderer/presentation/hooks/usePhaseEvents';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';

// Individual mock functions for each event
const mockOnPhaseChanged = vi.fn();
const mockOnSeriesCompleted = vi.fn();
const mockOnStageAdvanced = vi.fn();
const mockOnCompetitionStarted = vi.fn();
const mockOnCompetitionFinished = vi.fn();

describe('usePhaseEvents', () => {
  beforeEach(() => {
    useCompetitionStore.getState().resetCompetition();
    vi.clearAllMocks();

    // Default: return unsubscribe function
    mockOnPhaseChanged.mockReturnValue(vi.fn());
    mockOnSeriesCompleted.mockReturnValue(vi.fn());
    mockOnStageAdvanced.mockReturnValue(vi.fn());
    mockOnCompetitionStarted.mockReturnValue(vi.fn());
    mockOnCompetitionFinished.mockReturnValue(vi.fn());

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: {
        on: {
          phaseChanged: mockOnPhaseChanged,
          seriesCompleted: mockOnSeriesCompleted,
          stageAdvanced: mockOnStageAdvanced,
          competitionStarted: mockOnCompetitionStarted,
          competitionFinished: mockOnCompetitionFinished,
        },
      },
    });
  });

  afterEach(() => {
    delete (window as any).electronAPI;
  });

  describe('event subscription registration', () => {
    it('registers required event listeners on mount', () => {
      renderHook(() => usePhaseEvents());

      expect(mockOnPhaseChanged).toHaveBeenCalledTimes(1);
      expect(mockOnSeriesCompleted).toHaveBeenCalledTimes(1);
      expect(mockOnCompetitionStarted).toHaveBeenCalledTimes(1);
      expect(mockOnCompetitionFinished).toHaveBeenCalledTimes(1);
    });

    it('does not subscribe to stageAdvanced (integrated into phaseChanged)', () => {
      renderHook(() => usePhaseEvents());

      expect(mockOnStageAdvanced).not.toHaveBeenCalled();
    });

    it('unregisters all event listeners on unmount', () => {
      const unsubPhaseChanged = vi.fn();
      const unsubSeriesCompleted = vi.fn();
      const unsubCompetitionStarted = vi.fn();
      const unsubCompetitionFinished = vi.fn();

      mockOnPhaseChanged.mockReturnValue(unsubPhaseChanged);
      mockOnSeriesCompleted.mockReturnValue(unsubSeriesCompleted);
      mockOnCompetitionStarted.mockReturnValue(unsubCompetitionStarted);
      mockOnCompetitionFinished.mockReturnValue(unsubCompetitionFinished);

      const { unmount } = renderHook(() => usePhaseEvents());

      unmount();

      expect(unsubPhaseChanged).toHaveBeenCalledTimes(1);
      expect(unsubSeriesCompleted).toHaveBeenCalledTimes(1);
      expect(unsubCompetitionStarted).toHaveBeenCalledTimes(1);
      expect(unsubCompetitionFinished).toHaveBeenCalledTimes(1);
    });
  });

  describe('phaseChanged event', () => {
    it('updates the store on phase change event', () => {
      renderHook(() => usePhaseEvents());

      const callback = mockOnPhaseChanged.mock.calls[0]![0] as (data: {
        newPhase: string;
        stageIndex: number;
        seriesIndex: number;
        stageName: string;
        scored: boolean;
      }) => void;

      callback({
        newPhase: 'ACTIVE',
        stageIndex: 1,
        seriesIndex: 2,
        stageName: 'Qualification',
        scored: true,
      });

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('ACTIVE');
      expect(state.stageIndex).toBe(1);
      expect(state.seriesIndex).toBe(2);
      expect(state.currentStageName).toBe('Qualification');
      expect(state.scored).toBe(true);
    });

    it('sets timer to running during ACTIVE phase', () => {
      renderHook(() => usePhaseEvents());

      const callback = mockOnPhaseChanged.mock.calls[0]![0] as (data: {
        newPhase: string;
        stageIndex: number;
        seriesIndex: number;
        stageName: string;
        scored: boolean;
      }) => void;

      callback({
        newPhase: 'ACTIVE',
        stageIndex: 0,
        seriesIndex: 0,
        stageName: 'Match',
        scored: true,
      });

      const state = useCompetitionStore.getState();
      expect(state.isTimerRunning).toBe(true);
      expect(state.isTimerExpired).toBe(false);
    });

    it('stops the timer during non-ACTIVE phase', () => {
      // First set the timer to running state
      useCompetitionStore.getState().setTimerRunning(true);

      renderHook(() => usePhaseEvents());

      const callback = mockOnPhaseChanged.mock.calls[0]![0] as (data: {
        newPhase: string;
        stageIndex: number;
        seriesIndex: number;
        stageName: string;
        scored: boolean;
      }) => void;

      callback({
        newPhase: 'SERIES_COMPLETE',
        stageIndex: 0,
        seriesIndex: 3,
        stageName: 'Match',
        scored: true,
      });

      const state = useCompetitionStore.getState();
      expect(state.isTimerRunning).toBe(false);
    });

    it('correctly updates stageIndex/seriesIndex/scored via phaseChanged on stage advance', () => {
      renderHook(() => usePhaseEvents());

      const callback = mockOnPhaseChanged.mock.calls[0]![0] as (data: {
        newPhase: string;
        stageIndex: number;
        seriesIndex: number;
        stageName: string;
        scored: boolean;
      }) => void;

      // Stage advance: STAGE_ENTERED, new stageIndex=2, seriesIndex=0 reset
      callback({
        newPhase: 'STAGE_ENTERED',
        stageIndex: 2,
        seriesIndex: 0,
        stageName: 'Final',
        scored: true,
      });

      const state = useCompetitionStore.getState();
      expect(state.stageIndex).toBe(2);
      expect(state.currentStageName).toBe('Final');
      expect(state.scored).toBe(true);
      expect(state.seriesIndex).toBe(0);
    });
  });

  describe('seriesCompleted event', () => {
    it('advances seriesIndex on series completed event', () => {
      renderHook(() => usePhaseEvents());

      const callback = mockOnSeriesCompleted.mock.calls[0]![0] as (data: { seriesIndex: number }) => void;

      callback({ seriesIndex: 2 });

      const state = useCompetitionStore.getState();
      // advanceSeries(data.seriesIndex + 1) so 2+1=3
      expect(state.seriesIndex).toBe(3);
    });
  });

  describe('competitionStarted event', () => {
    it('resets the store on competition started event', () => {
      // Set state in the store
      useCompetitionStore.getState().setPhase('ACTIVE', 2, 3, 'Match', true);
      useCompetitionStore.getState().setTimerRunning(true);

      renderHook(() => usePhaseEvents());

      const callback = mockOnCompetitionStarted.mock.calls[0]![0] as (data: {
        shotsPerSeries?: number;
        acc: 'RING' | 'DECIMAL';
      }) => void;

      callback({ shotsPerSeries: 10, acc: 'DECIMAL' });

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('IDLE');
      expect(state.stageIndex).toBe(0);
      expect(state.seriesIndex).toBe(0);
      expect(state.isTimerRunning).toBe(false);
      expect(state.shotsPerSeries).toBe(10);
    });

    it('acc: RING -> store is set to RING', () => {
      renderHook(() => usePhaseEvents());

      const callback = mockOnCompetitionStarted.mock.calls[0]![0] as (data: {
        shotsPerSeries?: number;
        acc: 'RING' | 'DECIMAL';
      }) => void;

      callback({ acc: 'RING' });

      const state = useCompetitionStore.getState();
      expect(state.acc).toBe('RING');
    });

    it('acc: DECIMAL -> store is set to DECIMAL', () => {
      renderHook(() => usePhaseEvents());

      const callback = mockOnCompetitionStarted.mock.calls[0]![0] as (data: {
        shotsPerSeries?: number;
        acc: 'RING' | 'DECIMAL';
      }) => void;

      callback({ acc: 'DECIMAL' });

      const state = useCompetitionStore.getState();
      expect(state.acc).toBe('DECIMAL');
    });

    it('calls setAcc on competitionStarted event', () => {
      renderHook(() => usePhaseEvents());

      const callback = mockOnCompetitionStarted.mock.calls[0]![0] as (data: {
        shotsPerSeries?: number;
        acc: 'RING' | 'DECIMAL';
      }) => void;

      callback({ acc: 'RING' });

      // Verify that acc is correctly set in the store
      expect(useCompetitionStore.getState().acc).toBe('RING');
    });
  });

  describe('competitionFinished event', () => {
    it('sets FINISHED phase and stops timer on competition finished event', () => {
      useCompetitionStore.getState().setPhase('ACTIVE', 1, 5, 'Match', true);
      useCompetitionStore.getState().setTimerRunning(true);

      renderHook(() => usePhaseEvents());

      const callback = mockOnCompetitionFinished.mock.calls[0]![0] as () => void;

      callback();

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('FINISHED');
      expect(state.isTimerRunning).toBe(false);
    });
  });
});
