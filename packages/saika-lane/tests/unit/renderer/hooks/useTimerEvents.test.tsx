// SPDX-License-Identifier: MIT
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTimerEvents } from '@/renderer/presentation/hooks/useTimerEvents';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';

const mockOnTimerTick = vi.fn();
const mockOnTimerExpired = vi.fn();

describe('useTimerEvents', () => {
  beforeEach(() => {
    useCompetitionStore.getState().resetCompetition();
    vi.clearAllMocks();

    mockOnTimerTick.mockReturnValue(vi.fn());
    mockOnTimerExpired.mockReturnValue(vi.fn());

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: {
        on: {
          timerTick: mockOnTimerTick,
          timerExpired: mockOnTimerExpired,
        },
      },
    });
  });

  afterEach(() => {
    delete (window as any).electronAPI;
  });

  describe('event subscription registration', () => {
    it('registers timer event listeners on mount', () => {
      renderHook(() => useTimerEvents());

      expect(mockOnTimerTick).toHaveBeenCalledTimes(1);
      expect(mockOnTimerExpired).toHaveBeenCalledTimes(1);
    });

    it('unregisters timer event listeners on unmount', () => {
      const unsubTimerTick = vi.fn();
      const unsubTimerExpired = vi.fn();

      mockOnTimerTick.mockReturnValue(unsubTimerTick);
      mockOnTimerExpired.mockReturnValue(unsubTimerExpired);

      const { unmount } = renderHook(() => useTimerEvents());

      unmount();

      expect(unsubTimerTick).toHaveBeenCalledTimes(1);
      expect(unsubTimerExpired).toHaveBeenCalledTimes(1);
    });
  });

  describe('timerTick event', () => {
    it('updates the store on timer tick event', () => {
      renderHook(() => useTimerEvents());

      const callback = mockOnTimerTick.mock.calls[0]![0] as (data: {
        remainingSeconds: number;
        totalSeconds: number;
        formattedRemaining: string;
      }) => void;

      callback({
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

      const callback = mockOnTimerTick.mock.calls[0]![0] as (data: {
        remainingSeconds: number;
        totalSeconds: number;
        formattedRemaining: string;
      }) => void;

      callback({ remainingSeconds: 60, totalSeconds: 300, formattedRemaining: '01:00' });
      expect(useCompetitionStore.getState().remainingSeconds).toBe(60);

      callback({ remainingSeconds: 59, totalSeconds: 300, formattedRemaining: '00:59' });
      expect(useCompetitionStore.getState().remainingSeconds).toBe(59);
    });
  });

  describe('timerExpired event', () => {
    it('stops timer and sets expired flag on timer expired event', () => {
      useCompetitionStore.getState().setTimerRunning(true);

      renderHook(() => useTimerEvents());

      const callback = mockOnTimerExpired.mock.calls[0]![0] as () => void;

      callback();

      const state = useCompetitionStore.getState();
      expect(state.isTimerRunning).toBe(false);
      expect(state.isTimerExpired).toBe(true);
    });
  });
});
