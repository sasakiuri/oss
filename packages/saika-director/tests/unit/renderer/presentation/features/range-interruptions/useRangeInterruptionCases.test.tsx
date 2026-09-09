import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRangeInterruptionCases } from '@/renderer/presentation/features/range-interruptions/useRangeInterruptionCases';
import type { RangeInterruptionCaseDto, RangeInterruptionScopePayload } from '@/shared/ipc/contracts';

import { fixture } from './fixtures';

const { listAll, listByScope } = vi.hoisted(() => ({ listAll: vi.fn(), listByScope: vi.fn() }));
vi.mock('@/renderer/services', () => ({ rangeInterruptionsService: { listAll, listByScope } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const response = (...data: RangeInterruptionCaseDto[]) => ({ success: true as const, data });
const scope = (scopeId: string): RangeInterruptionScopePayload => ({ scopeType: 'COMPETITION', scopeId });

beforeEach(() => {
  vi.resetAllMocks();
  listAll.mockResolvedValue(response());
  listByScope.mockResolvedValue(response());
});

describe('useRangeInterruptionCases', () => {
  it('keeps the newest refresh when an older request finishes last', async () => {
    const first = deferred<ReturnType<typeof response>>();
    listAll.mockReturnValueOnce(first.promise).mockResolvedValueOnce(response(fixture({ summary: 'Current' })));
    const { result } = renderHook(() => useRangeInterruptionCases());
    await act(() => result.current.loadCases());
    await act(async () => first.resolve(response(fixture({ summary: 'Obsolete' }))));
    expect(result.current.selectedCase?.summary).toBe('Current');
    expect(result.current.loading).toBe(false);
  });

  it('invalidates the previous visit even when returning to the same scope', async () => {
    const first = deferred<ReturnType<typeof response>>();
    listByScope.mockReturnValueOnce(first.promise);
    const { result, rerender } = renderHook(({ id }) => useRangeInterruptionCases(scope(id)), {
      initialProps: { id: 'A' },
    });
    rerender({ id: 'B' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    listByScope.mockResolvedValueOnce(response(fixture({ summary: 'New visit' })));
    rerender({ id: 'A' });
    await waitFor(() => expect(result.current.selectedCase?.summary).toBe('New visit'));
    await act(async () => first.resolve(response(fixture({ summary: 'Old visit' }))));
    expect(result.current.selectedCase?.summary).toBe('New visit');
  });

  it('clears old records while a new scope is loading', async () => {
    listByScope.mockResolvedValueOnce(response(fixture()));
    const { result, rerender } = renderHook(({ id }) => useRangeInterruptionCases(scope(id)), {
      initialProps: { id: 'A' },
    });
    await waitFor(() => expect(result.current.cases).toHaveLength(1));
    listByScope.mockReturnValueOnce(new Promise(() => {}));
    rerender({ id: 'B' });
    expect(result.current.cases).toEqual([]);
    expect(result.current.selectedCase).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores an old mutation that completes with %s after switching scopes',
    async (completion) => {
      const oldMutation = deferred<RangeInterruptionCaseDto>();
      const currentMutation = deferred<RangeInterruptionCaseDto>();
      const { result, rerender } = renderHook(({ id }) => useRangeInterruptionCases(scope(id)), {
        initialProps: { id: 'A' },
      });
      await waitFor(() => expect(result.current.loading).toBe(false));
      let oldResult!: Promise<boolean>;
      act(() => {
        oldResult = result.current.runMutation(() => oldMutation.promise);
      });
      rerender({ id: 'B' });
      await waitFor(() => expect(result.current.loading).toBe(false));
      let currentResult!: Promise<boolean>;
      act(() => {
        currentResult = result.current.runMutation(() => currentMutation.promise);
      });
      await act(async () => {
        if (completion === 'resolve') oldMutation.resolve(fixture());
        else oldMutation.reject(new Error('Old failure'));
        expect(await oldResult).toBe(false);
      });
      expect(listByScope).toHaveBeenCalledTimes(2);
      expect(result.current.selectedCase).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.saving).toBe(true);
      await act(async () => {
        currentMutation.resolve(fixture());
        expect(await currentResult).toBe(true);
      });
      expect(result.current.saving).toBe(false);
    },
  );

  it('reloads the ledger after a failed mutation before exposing its error for retry', async () => {
    const { result } = renderHook(() => useRangeInterruptionCases());
    await waitFor(() => expect(result.current.loading).toBe(false));
    listAll.mockResolvedValueOnce(response(fixture({ summary: 'Persisted before acknowledgement failed' })));
    await act(async () => {
      expect(
        await result.current.runMutation(async () => {
          throw new Error('Acknowledgement lost');
        }),
      ).toBe(false);
    });
    expect(result.current.selectedCase?.summary).toBe('Persisted before acknowledgement failed');
    expect(result.current.error).toBe('Acknowledgement lost');
    expect(result.current.saving).toBe(false);
  });

  it('does not reload after a mutation completes on an unmounted panel', async () => {
    const mutation = deferred<RangeInterruptionCaseDto>();
    const { result, unmount } = renderHook(() => useRangeInterruptionCases());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.runMutation(() => mutation.promise);
    });
    unmount();
    mutation.resolve(fixture());
    expect(await pending).toBe(false);
    expect(listAll).toHaveBeenCalledTimes(1);
  });

  it('prevents overlapping mutations from executing twice', async () => {
    const mutation = deferred<RangeInterruptionCaseDto>();
    const { result } = renderHook(() => useRangeInterruptionCases());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.runMutation(() => mutation.promise);
    });
    const duplicate = vi.fn();
    expect(await result.current.runMutation(duplicate)).toBe(false);
    expect(duplicate).not.toHaveBeenCalled();
    await act(async () => {
      mutation.resolve(fixture());
      await pending;
    });
  });

  it('ignores requests from a discarded Strict Mode effect', async () => {
    const discarded = deferred<ReturnType<typeof response>>();
    listAll.mockReturnValueOnce(discarded.promise).mockResolvedValueOnce(response(fixture()));
    const { result } = renderHook(() => useRangeInterruptionCases(), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.cases).toHaveLength(1));
    await act(async () => discarded.reject(new Error('Discarded request')));
    expect(result.current.error).toBeNull();
    expect(result.current.cases).toHaveLength(1);
  });
});
