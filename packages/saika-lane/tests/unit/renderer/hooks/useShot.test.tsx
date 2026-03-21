// SPDX-License-Identifier: MIT
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useShot } from '@/renderer/presentation/hooks/useShot';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { ServiceError } from '@/renderer/services/createServiceMethod';
import { sessionService } from '@/renderer/services/sessionService';
import type { ShotDto } from '@/shared/ipc/contracts';

// Mock service modules
vi.mock('@/renderer/services/sessionService', () => ({
  sessionService: {
    startSession: vi.fn(),
    switchMode: vi.fn(),
    resetSession: vi.fn(),
    getSessionScore: vi.fn(),
    getShotHistory: vi.fn(),
  },
}));

const mockGetShotHistory = vi.mocked(sessionService.getShotHistory);

describe('useShot', () => {
  beforeEach(() => {
    const { resetSession } = useSessionStore.getState();
    resetSession();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('initializes with empty state', () => {
      const { result } = renderHook(() => useShot());

      expect(result.current.shots).toEqual([]);
      expect(result.current.latestShot).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('refreshShotHistory', () => {
    beforeEach(() => {
      // Set session ID
      const { setSessionId } = useSessionStore.getState();
      setSessionId('session-123');
    });

    it('successfully retrieves shot history', async () => {
      const mockShots: ShotDto[] = [
        {
          id: 'shot-1',
          shotNumber: 1,
          x: 10.5,
          y: 20.3,
          score: 10.2,
          timestamp: '2026-01-15T10:00:00Z',
          mode: 'MATCH',
          isRecorded: true,
          innerTen: false,
        },
        {
          id: 'shot-2',
          shotNumber: 2,
          x: 15.2,
          y: 18.7,
          score: 9.8,
          timestamp: '2026-01-15T10:01:00Z',
          mode: 'MATCH',
          isRecorded: true,
          innerTen: false,
        },
      ];

      // Service returns unwrapped data directly
      mockGetShotHistory.mockResolvedValue({
        sessionId: 'session-123',
        shots: mockShots,
      });

      const { result } = renderHook(() => useShot());

      await act(async () => {
        await result.current.refreshShotHistory();
      });

      expect(mockGetShotHistory).toHaveBeenCalledWith({
        sessionId: 'session-123',
      });

      expect(result.current.shots).toEqual(mockShots);
      expect(result.current.latestShot).toEqual(mockShots[1]);
      expect(result.current.isLoading).toBe(false);

      // Verify scores have been calculated
      const storeState = useSessionStore.getState();
      expect(storeState.totalScore).toBeCloseTo(20.0, 5); // 10.2 + 9.8
    });

    it('sets isLoading to true while fetching', async () => {
      type ShotHistoryDto = { sessionId: string; shots: ShotDto[] };

      let resolveGetShotHistory: (value: ShotHistoryDto) => void;
      const getShotHistoryPromise = new Promise<ShotHistoryDto>((resolve) => {
        resolveGetShotHistory = resolve;
      });

      mockGetShotHistory.mockReturnValue(getShotHistoryPromise);

      const { result } = renderHook(() => useShot());

      act(() => {
        result.current.refreshShotHistory();
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveGetShotHistory!({ sessionId: 'session-123', shots: [] });
        await getShotHistoryPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('does nothing when session ID is null', async () => {
      // Set session ID to null
      const { resetSession } = useSessionStore.getState();
      resetSession();

      const { result } = renderHook(() => useShot());

      await act(async () => {
        await result.current.refreshShotHistory();
      });

      expect(mockGetShotHistory).not.toHaveBeenCalled();
      expect(result.current.shots).toEqual([]);
    });

    it('silently handles fetch error and resets loading state (ServiceError)', async () => {
      // Service throws ServiceError on failure
      mockGetShotHistory.mockRejectedValue(
        new ServiceError('Failed to retrieve shot history', 'GET_SHOT_HISTORY_FAILED'),
      );

      const { result } = renderHook(() => useShot());

      await act(async () => {
        await result.current.refreshShotHistory();
      });

      // Verify error does not propagate and loading state is reset
      expect(result.current.isLoading).toBe(false);
    });

    it('silently handles unexpected error and resets loading state', async () => {
      mockGetShotHistory.mockRejectedValue(new Error('Unexpected error'));

      const { result } = renderHook(() => useShot());

      await act(async () => {
        await result.current.refreshShotHistory();
      });

      // Verify error does not propagate and loading state is reset
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('latestShot', () => {
    it('returns the first shot when there is only one shot', () => {
      const { setShots } = useSessionStore.getState();
      const mockShots: ShotDto[] = [
        {
          id: 'shot-1',
          shotNumber: 1,
          x: 10.5,
          y: 20.3,
          score: 10.2,
          timestamp: '2026-01-15T10:00:00Z',
          mode: 'MATCH',
          isRecorded: true,
          innerTen: false,
        },
      ];

      act(() => {
        setShots(mockShots);
      });

      const { result } = renderHook(() => useShot());

      expect(result.current.latestShot).toEqual(mockShots[0]);
    });

    it('returns the last shot when there are multiple shots', () => {
      const { setShots } = useSessionStore.getState();
      const mockShots: ShotDto[] = [
        {
          id: 'shot-1',
          shotNumber: 1,
          x: 10.5,
          y: 20.3,
          score: 10.2,
          timestamp: '2026-01-15T10:00:00Z',
          mode: 'MATCH',
          isRecorded: true,
          innerTen: false,
        },
        {
          id: 'shot-2',
          shotNumber: 2,
          x: 15.2,
          y: 18.7,
          score: 9.8,
          timestamp: '2026-01-15T10:01:00Z',
          mode: 'MATCH',
          isRecorded: true,
          innerTen: false,
        },
        {
          id: 'shot-3',
          shotNumber: 3,
          x: 12.1,
          y: 19.5,
          score: 10.0,
          timestamp: '2026-01-15T10:02:00Z',
          mode: 'MATCH',
          isRecorded: true,
          innerTen: false,
        },
      ];

      act(() => {
        setShots(mockShots);
      });

      const { result } = renderHook(() => useShot());

      expect(result.current.latestShot).toEqual(mockShots[2]);
    });

    it('returns null when there are no shots', () => {
      const { result } = renderHook(() => useShot());

      expect(result.current.latestShot).toBeNull();
    });
  });

  describe('score calculation', () => {
    it('includes only match mode shots in score calculation', () => {
      const { setShots } = useSessionStore.getState();
      const mockShots: ShotDto[] = [
        {
          id: 'shot-1',
          shotNumber: 1,
          x: 10.5,
          y: 20.3,
          score: 10.2,
          timestamp: '2026-01-15T10:00:00Z',
          mode: 'SIGHTING',
          isRecorded: false, // sighting mode
          innerTen: false,
        },
        {
          id: 'shot-2',
          shotNumber: 2,
          x: 15.2,
          y: 18.7,
          score: 9.8,
          timestamp: '2026-01-15T10:01:00Z',
          mode: 'MATCH',
          isRecorded: true, // match mode
          innerTen: false,
        },
        {
          id: 'shot-3',
          shotNumber: 3,
          x: 12.1,
          y: 19.5,
          score: 10.0,
          timestamp: '2026-01-15T10:02:00Z',
          mode: 'MATCH',
          isRecorded: true, // match mode
          innerTen: false,
        },
      ];

      act(() => {
        setShots(mockShots);
      });

      renderHook(() => useShot());

      // Total score for match mode only (9.8 + 10.0 = 19.8)
      const storeState = useSessionStore.getState();
      expect(storeState.totalScore).toBeCloseTo(19.8, 5);
    });

    it('calculates series scores every 10 shots', () => {
      const { setShots } = useSessionStore.getState();
      const mockShots: ShotDto[] = [];

      // Create 25 shots (series 1: 10 shots, series 2: 10 shots, series 3: 5 shots)
      for (let i = 0; i < 25; i++) {
        mockShots.push({
          id: `shot-${i + 1}`,
          shotNumber: i + 1,
          x: 10.0,
          y: 10.0,
          score: 10.0,
          timestamp: `2026-01-15T10:${String(i).padStart(2, '0')}:00Z`,
          mode: 'MATCH',
          isRecorded: true,
          innerTen: false,
        });
      }

      act(() => {
        setShots(mockShots);
      });

      renderHook(() => useShot());

      const storeState = useSessionStore.getState();
      expect(storeState.totalScore).toBeCloseTo(250.0, 5); // 25 * 10.0
      expect(storeState.seriesScores).toEqual([100.0, 100.0, 50.0]);
    });

    it('returns total score of 0 for an empty shots array', () => {
      const { setShots } = useSessionStore.getState();

      act(() => {
        setShots([]);
      });

      renderHook(() => useShot());

      const storeState = useSessionStore.getState();
      expect(storeState.totalScore).toBe(0);
      expect(storeState.seriesScores).toEqual([]);
    });

    it('recalculates scores each time a shot is added', () => {
      renderHook(() => useShot());

      const shot1: ShotDto = {
        id: 'shot-1',
        shotNumber: 1,
        x: 10.0,
        y: 10.0,
        score: 10.0,
        timestamp: '2026-01-15T10:00:00Z',
        mode: 'MATCH',
        isRecorded: true,
        innerTen: false,
      };

      act(() => {
        const { addShot } = useSessionStore.getState();
        addShot(shot1);
      });

      let storeState = useSessionStore.getState();
      expect(storeState.totalScore).toBe(10.0);

      const shot2: ShotDto = {
        id: 'shot-2',
        shotNumber: 2,
        x: 9.0,
        y: 9.0,
        score: 9.5,
        timestamp: '2026-01-15T10:01:00Z',
        mode: 'MATCH',
        isRecorded: true,
        innerTen: false,
      };

      act(() => {
        const { addShot } = useSessionStore.getState();
        addShot(shot2);
      });

      storeState = useSessionStore.getState();
      expect(storeState.totalScore).toBe(19.5);
    });
  });

  describe('auto-fetch on session change', () => {
    it('automatically fetches shot history when session ID is set', async () => {
      // Service returns unwrapped data directly
      mockGetShotHistory.mockResolvedValue({
        sessionId: 'session-new',
        shots: [
          {
            id: 'shot-1',
            shotNumber: 1,
            x: 10.0,
            y: 10.0,
            score: 10.0,
            timestamp: '2026-01-15T10:00:00Z',
            mode: 'MATCH',
            isRecorded: true,
            innerTen: false,
          },
        ],
      });

      // Render useShot (no session ID in initial state)
      renderHook(() => useShot());

      // Set session ID
      act(() => {
        const { setSessionId } = useSessionStore.getState();
        setSessionId('session-new');
      });

      // Verify getShotHistory was called
      await waitFor(() => {
        expect(mockGetShotHistory).toHaveBeenCalledWith({
          sessionId: 'session-new',
        });
      });
    });

    it('does not auto-fetch when session ID is null', async () => {
      renderHook(() => useShot());

      // Set session ID to null
      act(() => {
        const { resetSession } = useSessionStore.getState();
        resetSession();
      });

      // Verify getShotHistory was not called
      await waitFor(() => {
        expect(mockGetShotHistory).not.toHaveBeenCalled();
      });
    });
  });

  describe('integration scenario', () => {
    it('full scenario of shot history fetch, shot addition, and score update works correctly', async () => {
      const { setSessionId } = useSessionStore.getState();
      setSessionId('session-integration');

      const initialShots: ShotDto[] = [
        {
          id: 'shot-1',
          shotNumber: 1,
          x: 10.0,
          y: 10.0,
          score: 10.0,
          timestamp: '2026-01-15T10:00:00Z',
          mode: 'MATCH',
          isRecorded: true,
          innerTen: false,
        },
      ];

      mockGetShotHistory.mockResolvedValue({
        sessionId: 'session-integration',
        shots: initialShots,
      });

      const { result } = renderHook(() => useShot());

      await act(async () => {
        await result.current.refreshShotHistory();
      });

      expect(result.current.shots).toEqual(initialShots);
      expect(result.current.latestShot).toEqual(initialShots[0]);

      let storeState = useSessionStore.getState();
      expect(storeState.totalScore).toBe(10.0);

      const newShot: ShotDto = {
        id: 'shot-2',
        shotNumber: 2,
        x: 9.5,
        y: 9.5,
        score: 9.8,
        timestamp: '2026-01-15T10:01:00Z',
        mode: 'MATCH',
        isRecorded: true,
        innerTen: false,
      };

      act(() => {
        const { addShot } = useSessionStore.getState();
        addShot(newShot);
      });

      storeState = useSessionStore.getState();
      expect(storeState.shots).toHaveLength(2);
      expect(storeState.totalScore).toBeCloseTo(19.8, 5);

      expect(result.current.latestShot).toEqual(newShot);
    });
  });
});
