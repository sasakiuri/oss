import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockGetByEvent = vi.fn();
const mockGetByRelay = vi.fn();
const mockConfirm = vi.fn();

vi.mock('@/renderer/services', () => ({
  resultsService: {
    getByEvent: (...args: unknown[]) => mockGetByEvent(...args),
    getByRelay: (...args: unknown[]) => mockGetByRelay(...args),
    confirm: (...args: unknown[]) => mockConfirm(...args),
  },
}));

import { useResults } from '@/renderer/presentation/hooks/useResults';

describe('useResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have empty results', () => {
      const { result } = renderHook(() => useResults());
      expect(result.current.results).toEqual([]);
    });

    it('should have loading as false', () => {
      const { result } = renderHook(() => useResults());
      expect(result.current.loading).toBe(false);
    });

    it('should have null error', () => {
      const { result } = renderHook(() => useResults());
      expect(result.current.error).toBeNull();
    });
  });

  describe('getEventResults', () => {
    it('should fetch and set results', async () => {
      mockGetByEvent.mockResolvedValue({ success: true, data: { results: [{ id: 'r1', rank: 1 }] } });

      const { result } = renderHook(() => useResults());

      await act(async () => {
        await result.current.getEventResults('event-1');
      });

      expect(mockGetByEvent).toHaveBeenCalledWith({ eventId: 'event-1' });
      expect(result.current.results).toEqual([{ id: 'r1', rank: 1 }]);
      expect(result.current.loading).toBe(false);
    });

    it('should handle error', async () => {
      mockGetByEvent.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useResults());

      await act(async () => {
        await result.current.getEventResults('event-1');
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.loading).toBe(false);
    });

    it('should handle non-Error rejection', async () => {
      mockGetByEvent.mockRejectedValue('unknown');

      const { result } = renderHook(() => useResults());

      await act(async () => {
        await result.current.getEventResults('event-1');
      });

      expect(result.current.error).toBe('Failed to load results');
    });
  });

  describe('getRelayResults', () => {
    it('should fetch relay results', async () => {
      mockGetByRelay.mockResolvedValue({ success: true, data: { results: [{ id: 'r1' }] } });

      const { result } = renderHook(() => useResults());

      await act(async () => {
        await result.current.getRelayResults('event-1', 1);
      });

      expect(mockGetByRelay).toHaveBeenCalledWith({ eventId: 'event-1', relayNumber: 1 });
      expect(result.current.results).toEqual([{ id: 'r1' }]);
    });

    it('should handle relay results error', async () => {
      mockGetByRelay.mockRejectedValue(new Error('Relay error'));

      const { result } = renderHook(() => useResults());

      await act(async () => {
        await result.current.getRelayResults('event-1', 1);
      });

      expect(result.current.error).toBe('Relay error');
    });

    it('should not let an older request overwrite newer results', async () => {
      let resolveOlder!: (value: unknown) => void;
      let resolveNewer!: (value: unknown) => void;
      mockGetByEvent.mockReturnValue(new Promise((resolve) => (resolveOlder = resolve)));
      mockGetByRelay.mockReturnValue(new Promise((resolve) => (resolveNewer = resolve)));
      const { result } = renderHook(() => useResults());
      let olderRequest!: Promise<unknown>;
      let newerRequest!: Promise<unknown>;
      act(() => {
        olderRequest = result.current.getEventResults('event-1');
        newerRequest = result.current.getRelayResults('event-2', 2);
      });

      await act(async () => {
        resolveNewer({ success: true, data: { results: [{ id: 'newer' }] } });
        await newerRequest;
      });
      expect(result.current.results).toEqual([{ id: 'newer' }]);

      await act(async () => {
        resolveOlder({ success: true, data: { results: [{ id: 'older' }] } });
        await olderRequest;
      });
      expect(result.current.results).toEqual([{ id: 'newer' }]);
    });
  });

  describe('confirmResults', () => {
    it('should confirm results', async () => {
      mockConfirm.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useResults());

      await act(async () => {
        await result.current.confirmResults('event-1', ['r1', 'r2']);
      });

      expect(mockConfirm).toHaveBeenCalledWith({
        eventId: 'event-1',
        resultIds: ['r1', 'r2'],
      });
      expect(result.current.loading).toBe(false);
    });

    it('should handle confirm error', async () => {
      mockConfirm.mockRejectedValue(new Error('Confirm failed'));

      const { result } = renderHook(() => useResults());

      await act(async () => {
        await result.current.confirmResults('event-1', ['r1']);
      });

      expect(result.current.error).toBe('Confirm failed');
    });

    it('should handle an unsuccessful confirm response', async () => {
      mockConfirm.mockResolvedValue({
        success: false,
        error: { message: 'Result no longer exists' },
      });

      const { result } = renderHook(() => useResults());
      let response: Awaited<ReturnType<typeof result.current.confirmResults>>;

      await act(async () => {
        response = await result.current.confirmResults('event-1', ['r1']);
      });

      expect(response!).toBeNull();
      expect(result.current.error).toBe('Result no longer exists');
      expect(result.current.loading).toBe(false);
    });

    it('does not let an older confirmation change state after a newer results request', async () => {
      let resolveConfirm!: (value: unknown) => void;
      mockConfirm.mockReturnValue(new Promise((resolve) => (resolveConfirm = resolve)));
      mockGetByEvent.mockResolvedValue({ success: true, data: { results: [{ id: 'newer' }] } });
      const { result } = renderHook(() => useResults());
      let confirmRequest!: Promise<unknown>;

      act(() => {
        confirmRequest = result.current.confirmResults('event-1', ['r1']);
      });
      await act(async () => {
        await result.current.getEventResults('event-2');
      });
      expect(result.current.results).toEqual([{ id: 'newer' }]);

      await act(async () => {
        resolveConfirm({ success: true });
        await confirmRequest;
      });
      expect(result.current.results).toEqual([{ id: 'newer' }]);
      expect(result.current.loading).toBe(false);
    });
  });

  describe('clearResults', () => {
    it('should clear all results state', async () => {
      mockGetByEvent.mockResolvedValue({ success: true, data: { results: [{ id: 'r1' }] } });

      const { result } = renderHook(() => useResults());

      await act(async () => {
        await result.current.getEventResults('event-1');
      });

      act(() => {
        result.current.clearResults();
      });

      expect(result.current.results).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });
});
