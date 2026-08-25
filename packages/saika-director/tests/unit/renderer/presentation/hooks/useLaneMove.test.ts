import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { mockStore, mockMoveLane } = vi.hoisted(() => ({
  mockStore: {
    setLoading: vi.fn(),
    setError: vi.fn(),
    openModal: vi.fn(),
    closeModal: vi.fn(),
    setSelectedTargetLaneId: vi.fn(),
    isOpen: false,
    sourceLaneId: null as string | null,
    sourceLaneName: null as string | null,
    sourceChannel: null as number | null,
    selectedTargetLaneId: null as string | null,
    loading: false,
    error: null as string | null,
  },
  mockMoveLane: vi.fn(),
}));

// --- Mock: Logger ---
vi.mock('@/shared/utils/Logger', () => ({
  Logger: {
    create: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      logError: vi.fn(),
      userAction: vi.fn(),
      startTimer: vi.fn(),
    }),
  },
}));

// --- Mock: Store ---
vi.mock('@/renderer/presentation/stores/ui/modals.store', () => ({
  useLaneMoveStore: () => mockStore,
}));

// --- Mock: Service ---
vi.mock('@/renderer/services', () => ({
  laneControlService: {
    moveLane: mockMoveLane,
  },
}));

import { useLaneMove } from '@/renderer/presentation/hooks/useLaneMove';

describe('useLaneMove', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.loading = false;
    mockStore.error = null;
  });

  describe('moveLane', () => {
    it('returns true and resets loading on success', async () => {
      mockMoveLane.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useLaneMove());

      let returnValue: boolean;
      await act(async () => {
        returnValue = await result.current.moveLane({ fromLaneId: 'lane-1', toLaneId: 'lane-2' });
      });

      expect(returnValue!).toBe(true);
      expect(mockMoveLane).toHaveBeenCalledWith({ fromLaneId: 'lane-1', toLaneId: 'lane-2' });
      expect(mockStore.setLoading).toHaveBeenCalledWith(true);
      expect(mockStore.setLoading).toHaveBeenLastCalledWith(false);
      expect(mockStore.setError).toHaveBeenCalledWith(null);
    });

    it('returns false and sets an error for an unsuccessful response', async () => {
      mockMoveLane.mockResolvedValue({
        success: false,
        error: { message: 'The target Lane is not empty' },
      });

      const { result } = renderHook(() => useLaneMove());

      let returnValue: boolean;
      await act(async () => {
        returnValue = await result.current.moveLane({ fromLaneId: 'lane-1', toLaneId: 'lane-2' });
      });

      expect(returnValue!).toBe(false);
      expect(mockStore.setError).toHaveBeenCalledWith('The target Lane is not empty');
    });

    it('returns false and sets an error when an exception is thrown', async () => {
      mockMoveLane.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useLaneMove());

      let returnValue: boolean;
      await act(async () => {
        returnValue = await result.current.moveLane({ fromLaneId: 'lane-1', toLaneId: 'lane-2' });
      });

      expect(returnValue!).toBe(false);
      expect(mockStore.setError).toHaveBeenCalledWith('Network error');
      expect(mockStore.setLoading).toHaveBeenLastCalledWith(false);
    });

    it('uses the default message when a non-Error value is thrown', async () => {
      mockMoveLane.mockRejectedValue('unknown error');

      const { result } = renderHook(() => useLaneMove());

      let returnValue: boolean;
      await act(async () => {
        returnValue = await result.current.moveLane({ fromLaneId: 'lane-1', toLaneId: 'lane-2' });
      });

      expect(returnValue!).toBe(false);
      expect(mockStore.setError).toHaveBeenCalledWith('Failed to move the Lane');
    });
  });

  describe('openModal', () => {
    it('calls openModal on the store', () => {
      const { result } = renderHook(() => useLaneMove());

      act(() => {
        result.current.openModal('lane-1', 'Lane 1', 1);
      });

      expect(mockStore.openModal).toHaveBeenCalledWith('lane-1', 'Lane 1', 1);
    });
  });
});
