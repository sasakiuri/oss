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
import { fail, ok } from '../../../../helpers/renderer/serviceResponses';

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
      mockGetByEvent.mockResolvedValue(ok({ results: [{ id: 'r1', rank: 1 }] }));

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
      mockGetByRelay.mockResolvedValue(ok({ results: [{ id: 'r1' }] }));

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
        resolveNewer(ok({ results: [{ id: 'newer' }] }));
        await newerRequest;
      });
      expect(result.current.results).toEqual([{ id: 'newer' }]);

      await act(async () => {
        resolveOlder(ok({ results: [{ id: 'older' }] }));
        await olderRequest;
      });
      expect(result.current.results).toEqual([{ id: 'newer' }]);
    });

    it('resolves an older request with null once a newer one has started', async () => {
      let resolveOlder!: (value: unknown) => void;
      mockGetByEvent.mockReturnValueOnce(new Promise((resolve) => (resolveOlder = resolve)));
      mockGetByRelay.mockResolvedValue(ok({ results: [{ id: 'newer' }] }));
      const { result } = renderHook(() => useResults());
      let olderRequest!: Promise<unknown>;
      act(() => {
        olderRequest = result.current.getEventResults('event-1');
      });
      await act(async () => {
        await result.current.getRelayResults('event-1', 2);
      });

      await act(async () => {
        resolveOlder(ok({ results: [{ id: 'older' }] }));
        await expect(olderRequest).resolves.toBeNull();
      });
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

      expect(result.current.confirmError).toBe('Confirm failed');
      expect(result.current.error).toBeNull();
    });

    it('should handle an unsuccessful confirm response', async () => {
      mockConfirm.mockResolvedValue(fail('Result no longer exists'));

      const { result } = renderHook(() => useResults());
      let response: Awaited<ReturnType<typeof result.current.confirmResults>>;

      await act(async () => {
        response = await result.current.confirmResults('event-1', ['r1']);
      });

      expect(response!).toBeNull();
      expect(result.current.confirmError).toBe('Result no longer exists');
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
    });

    it('does not let an older confirmation change state after a newer results request', async () => {
      let resolveConfirm!: (value: unknown) => void;
      mockConfirm.mockReturnValue(new Promise((resolve) => (resolveConfirm = resolve)));
      mockGetByEvent.mockResolvedValue(ok({ results: [{ id: 'newer' }] }));
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

  describe('a failed confirmation', () => {
    it('keeps the loaded results and is cleared by the next request', async () => {
      mockGetByEvent.mockResolvedValue(ok({ results: [{ id: 'r1' }] }));
      mockConfirm.mockResolvedValue(fail('Refused'));
      const { result } = renderHook(() => useResults());
      await act(async () => {
        await result.current.getEventResults('event-1');
      });

      await act(async () => {
        await result.current.confirmResults('event-1', ['r1']);
      });
      expect(result.current.results).toEqual([{ id: 'r1' }]);
      expect(result.current.confirmError).toBe('Refused');

      await act(async () => {
        await result.current.getEventResults('event-1');
      });
      expect(result.current.confirmError).toBeNull();
      expect(result.current.results).toEqual([{ id: 'r1' }]);
    });
  });

  describe('clearResults', () => {
    it('should clear all results state', async () => {
      mockGetByEvent.mockResolvedValue(ok({ results: [{ id: 'r1' }] }));

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

  describe('responses and failure texts', () => {
    type Query = 'getEventResults' | 'getRelayResults' | 'confirmResults';
    const queries: Record<Query, { mock: typeof mockGetByEvent; fallback: string }> = {
      getEventResults: { mock: mockGetByEvent, fallback: 'Failed to load results' },
      getRelayResults: { mock: mockGetByRelay, fallback: 'Failed to load relay results' },
      confirmResults: { mock: mockConfirm, fallback: 'Failed to confirm results' },
    };

    function run(hook: ReturnType<typeof useResults>, query: Query) {
      if (query === 'getEventResults') return hook.getEventResults('event-1');
      if (query === 'getRelayResults') return hook.getRelayResults('event-1', 2);
      return hook.confirmResults('event-1', ['r1']);
    }

    it.each(['getEventResults', 'getRelayResults', 'confirmResults'] as const)(
      '%s shows the message of a failed response, or its fallback text, and resolves null',
      async (query) => {
        const { mock, fallback } = queries[query];
        const { result } = renderHook(() => useResults());

        for (const [response, message] of [
          [fail('Request refused'), 'Request refused'],
          [{ success: false }, fallback],
        ] as const) {
          mock.mockResolvedValueOnce(response);
          let returned: unknown = 'unset';
          await act(async () => {
            returned = await run(result.current, query);
          });
          expect(returned).toBeNull();
          expect(query === 'confirmResults' ? result.current.confirmError : result.current.error).toBe(message);
          expect(query === 'confirmResults' ? result.current.error : result.current.confirmError).toBeNull();
          expect(result.current.loading).toBe(false);
        }
      },
    );

    it.each(['getEventResults', 'getRelayResults', 'confirmResults'] as const)(
      '%s shows its fallback text for a rejected value without a message',
      async (query) => {
        const { mock, fallback } = queries[query];
        mock.mockRejectedValueOnce('offline');
        const { result } = renderHook(() => useResults());

        await act(async () => {
          await run(result.current, query);
        });

        expect(query === 'confirmResults' ? result.current.confirmError : result.current.error).toBe(fallback);
        expect(result.current.loading).toBe(false);
      },
    );

    it.each(['getEventResults', 'getRelayResults'] as const)('%s resolves the loaded data', async (query) => {
      const response = ok({ results: [{ id: 'r1' }] });
      queries[query].mock.mockResolvedValueOnce(response);
      const { result } = renderHook(() => useResults());
      let returned: unknown;

      await act(async () => {
        returned = await run(result.current, query);
      });

      expect(returned).toBe(response.data);
    });

    it('confirmResults resolves the successful response itself', async () => {
      const response = ok({ results: [{ id: 'r1' }] });
      mockConfirm.mockResolvedValueOnce(response);
      const { result } = renderHook(() => useResults());
      let returned: unknown;

      await act(async () => {
        returned = await run(result.current, 'confirmResults');
      });

      expect(returned).toBe(response);
    });

    it('keeps the loaded results when a later request fails', async () => {
      mockGetByEvent.mockResolvedValueOnce(ok({ results: [{ id: 'r1' }] }));
      mockGetByRelay.mockResolvedValueOnce(fail('Relay refused'));
      const { result } = renderHook(() => useResults());

      await act(async () => {
        await result.current.getEventResults('event-1');
      });
      await act(async () => {
        await result.current.getRelayResults('event-1', 2);
      });

      expect(result.current.results).toEqual([{ id: 'r1' }]);
      expect(result.current.error).toBe('Relay refused');
    });

    it('keeps the loaded results and clears the error after a confirmation', async () => {
      mockGetByEvent.mockResolvedValueOnce(fail('Results refused'));
      mockConfirm.mockResolvedValueOnce({ success: true });
      const { result } = renderHook(() => useResults());

      await act(async () => {
        await result.current.getEventResults('event-1');
      });
      await act(async () => {
        await result.current.confirmResults('event-1', ['r1']);
      });

      expect(result.current.error).toBeNull();
      expect(result.current.results).toEqual([]);
    });
  });
});
