// SPDX-License-Identifier: MIT
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTimerEvents } from '@/renderer/presentation/hooks/useTimerEvents';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';

import { emit, installMockElectronAPI, type MockedElectronAPI } from '../../../../helpers/mockElectronAPI';

describe('useTimerEvents', () => {
  let api: MockedElectronAPI;

  beforeEach(() => {
    useCompetitionStore.getState().resetCompetition();
    api = installMockElectronAPI();
  });

  describe('event subscription registration', () => {
    it('registers timer event listeners on mount', () => {
      renderHook(() => useTimerEvents());

      expect(api.on.timerTick).toHaveBeenCalledTimes(1);
      expect(api.on.timerExpired).toHaveBeenCalledTimes(1);
      expect(api.on.competitionInterruptionChanged).toHaveBeenCalledTimes(1);
    });

    it('unregisters timer event listeners on unmount', () => {
      const unsubTimerTick = vi.fn();
      const unsubTimerExpired = vi.fn();
      const unsubInterruptionChanged = vi.fn();

      api.on.timerTick.mockReturnValue(unsubTimerTick);
      api.on.timerExpired.mockReturnValue(unsubTimerExpired);
      api.on.competitionInterruptionChanged.mockReturnValue(unsubInterruptionChanged);

      const { unmount } = renderHook(() => useTimerEvents());

      unmount();

      expect(unsubTimerTick).toHaveBeenCalledTimes(1);
      expect(unsubTimerExpired).toHaveBeenCalledTimes(1);
      expect(unsubInterruptionChanged).toHaveBeenCalledTimes(1);
    });
  });

  describe('timerTick event', () => {
    it('updates the store on timer tick event', () => {
      renderHook(() => useTimerEvents());

      emit('timerTick', {
        remainingSeconds: 120,
        totalSeconds: 300,
        formattedRemaining: '02:00',
      });

      const state = useCompetitionStore.getState();
      expect(state.remainingSeconds).toBe(120);
      expect(state.totalSeconds).toBe(300);
    });

    it('updates the store sequentially on multiple tick events', () => {
      renderHook(() => useTimerEvents());

      emit('timerTick', { remainingSeconds: 60, totalSeconds: 300, formattedRemaining: '01:00' });
      expect(useCompetitionStore.getState().remainingSeconds).toBe(60);

      emit('timerTick', { remainingSeconds: 59, totalSeconds: 300, formattedRemaining: '00:59' });
      expect(useCompetitionStore.getState().remainingSeconds).toBe(59);
    });
  });

  describe('timerExpired event', () => {
    it('sets the expired flag and clears the interruption on timer expired event', () => {
      useCompetitionStore.getState().setInterruption({
        interruptionId: '22222222-2222-4222-8222-222222222222',
        status: 'RUNNING_MATCH',
        remainingSeconds: 10,
        unlimitedSightingShots: false,
      });

      renderHook(() => useTimerEvents());

      emit('timerExpired', { stageIndex: 0 });

      const state = useCompetitionStore.getState();
      expect(state.isTimerExpired).toBe(true);
      expect(state.interruption).toBeNull();
    });
  });

  describe('competitionInterruptionChanged event', () => {
    it('records the STOP state', () => {
      renderHook(() => useTimerEvents());

      emit('competitionInterruptionChanged', {
        competitionId: 'competition-1',
        interruptionId: '22222222-2222-4222-8222-222222222222',
        status: 'PAUSED',
        remainingSeconds: 240,
        unlimitedSightingShots: false,
      });

      expect(useCompetitionStore.getState()).toMatchObject({
        interruption: { status: 'PAUSED', remainingSeconds: 240 },
      });
    });
  });
});
