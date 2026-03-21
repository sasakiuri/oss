// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppNavigation } from '@/renderer/presentation/hooks/useAppNavigation';

const mockSessionStore = { currentSessionId: null as string | null };
vi.mock('@/renderer/presentation/stores/sessionStore', () => ({
  useSessionStore: () => mockSessionStore,
}));

const mockCompetitionStoreState = { savedCompetitionTypeId: null as string | null };
vi.mock('@/renderer/presentation/stores/competitionStore', () => ({
  useCompetitionStore: {
    getState: () => mockCompetitionStoreState,
  },
}));

describe('useAppNavigation', () => {
  let mockStartCompetition: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockStartCompetition = vi.fn().mockResolvedValue({ competitionId: 'comp-1', sessionId: 'sess-1' });
    mockSessionStore.currentSessionId = null;
    mockCompetitionStoreState.savedCompetitionTypeId = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('initial screen is splash', () => {
    const { result } = renderHook(() => useAppNavigation({ startCompetition: mockStartCompetition }));
    expect(result.current.screen).toBe('splash');
  });

  describe('SplashScreen timer', () => {
    it('transitions from splash to main (2-second timer)', async () => {
      vi.useFakeTimers();

      const { result } = renderHook(() => useAppNavigation({ startCompetition: mockStartCompetition }));

      expect(result.current.screen).toBe('splash');

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(result.current.screen).toBe('main');
    });

    it('does not transition to main before 2 seconds', () => {
      vi.useFakeTimers();

      const { result } = renderHook(() => useAppNavigation({ startCompetition: mockStartCompetition }));

      act(() => {
        vi.advanceTimersByTime(1999);
      });

      expect(result.current.screen).toBe('splash');
    });
  });

  describe('automatic session creation', () => {
    it('creates a competition in IDLE state with saved competition type when no session exists', async () => {
      vi.useFakeTimers();
      mockCompetitionStoreState.savedCompetitionTypeId = 'BP60';

      renderHook(() => useAppNavigation({ startCompetition: mockStartCompetition }));

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(mockStartCompetition).toHaveBeenCalledWith('BP60');
    });

    it('uses default BR60S when no saved competition type exists', async () => {
      vi.useFakeTimers();
      mockCompetitionStoreState.savedCompetitionTypeId = null;

      renderHook(() => useAppNavigation({ startCompetition: mockStartCompetition }));

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(mockStartCompetition).toHaveBeenCalledWith('BR60S');
    });

    it('does not call startCompetition when an existing session exists', async () => {
      vi.useFakeTimers();
      mockSessionStore.currentSessionId = 'existing-session';

      renderHook(() => useAppNavigation({ startCompetition: mockStartCompetition }));

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(mockStartCompetition).not.toHaveBeenCalled();
    });

    it('transitions to main even when startCompetition fails', async () => {
      vi.useFakeTimers();
      mockStartCompetition.mockRejectedValue(new Error('Failed'));

      const { result } = renderHook(() => useAppNavigation({ startCompetition: mockStartCompetition }));

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(result.current.screen).toBe('main');
    });

    it('does not call startStage (remains in IDLE state)', async () => {
      vi.useFakeTimers();

      renderHook(() => useAppNavigation({ startCompetition: mockStartCompetition }));

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      // startCompetition only creates in IDLE state, no preparation auto-start
      expect(mockStartCompetition).toHaveBeenCalledTimes(1);
    });
  });

  describe('return value', () => {
    it('returns only screen', () => {
      const { result } = renderHook(() => useAppNavigation({ startCompetition: mockStartCompetition }));

      expect(result.current).toHaveProperty('screen');
      expect(Object.keys(result.current)).toEqual(['screen']);
    });
  });
});
