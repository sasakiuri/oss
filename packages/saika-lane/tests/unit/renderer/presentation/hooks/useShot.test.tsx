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

  it('merges a delayed history reply with live shot IDs', async () => {
    useSessionStore.getState().setSessionId('saved');
    let resolve!: (history: { sessionId: string; shots: ShotDto[]; nullifiedExtras: [] }) => void;
    mockGetShotHistory.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { result } = renderHook(() => useShot());
    const shot: ShotDto = {
      id: 'live',
      shotNumber: 1,
      x: 0,
      y: 0,
      score: 100,
      innerTen: true,
      mode: 'MATCH',
      isRecorded: true,
      timestamp: '2026-01-01T00:00:00Z',
    };
    act(() => useSessionStore.getState().addShot(shot));
    await act(async () => resolve({ sessionId: 'saved', nullifiedExtras: [], shots: [shot] }));
    expect(result.current.shots).toEqual([shot]);
  });

  describe('initial state', () => {
    it('initializes with empty state', () => {
      const { result } = renderHook(() => useShot());

      expect(result.current.shots).toEqual([]);
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
        nullifiedExtras: [],
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

    it('silently handles fetch error (ServiceError)', async () => {
      // Service throws ServiceError on failure
      mockGetShotHistory.mockRejectedValue(
        new ServiceError('Failed to retrieve shot history', 'GET_SHOT_HISTORY_FAILED'),
      );

      const { result } = renderHook(() => useShot());

      await act(async () => {
        await result.current.refreshShotHistory();
      });

      // Verify the error does not propagate and the shots stay as they were
      expect(result.current.shots).toEqual([]);
    });

    it('silently handles unexpected error', async () => {
      mockGetShotHistory.mockRejectedValue(new Error('Unexpected error'));

      const { result } = renderHook(() => useShot());

      await act(async () => {
        await result.current.refreshShotHistory();
      });

      // Verify the error does not propagate and the shots stay as they were
      expect(result.current.shots).toEqual([]);
    });
  });

  describe('auto-fetch on session change', () => {
    it('automatically fetches shot history when session ID is set', async () => {
      // Service returns unwrapped data directly
      mockGetShotHistory.mockResolvedValue({
        sessionId: 'session-new',
        nullifiedExtras: [],
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
    it('full scenario of shot history fetch and shot addition works correctly', async () => {
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
        nullifiedExtras: [],
        shots: initialShots,
      });

      const { result } = renderHook(() => useShot());

      await act(async () => {
        await result.current.refreshShotHistory();
      });

      expect(result.current.shots).toEqual(initialShots);
      expect(result.current.shots.at(-1)).toEqual(initialShots[0]);

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

      expect(useSessionStore.getState().shots).toHaveLength(2);

      expect(result.current.shots.at(-1)).toEqual(newShot);
    });
  });
});
