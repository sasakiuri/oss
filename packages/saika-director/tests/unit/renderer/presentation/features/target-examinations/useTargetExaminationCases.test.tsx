import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTargetExaminationCases } from '@/renderer/presentation/features/target-examinations/useTargetExaminationCases';
import type { TargetExaminationCaseDto, TargetExaminationScopePayload } from '@/shared/ipc/contracts';

import { CASE_ID, caseFixture, deferred } from './fixtures';

const { listAll, listByScope, appendEntry } = vi.hoisted(() => ({
  listAll: vi.fn(),
  listByScope: vi.fn(),
  appendEntry: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({ targetExaminationsService: { listAll, listByScope, appendEntry } }));

const response = (...data: TargetExaminationCaseDto[]) => ({ success: true as const, data });
const updated = () => ({ success: true as const, data: caseFixture() });
const scope = (scopeId: string): TargetExaminationScopePayload => ({ scopeType: 'COMPETITION', scopeId });
const entry = { caseId: CASE_ID, type: 'NOTE' as const, statement: 'Examined records', officialName: 'RTS Officer' };

beforeEach(() => {
  vi.resetAllMocks();
  listAll.mockResolvedValue(response());
  listByScope.mockResolvedValue(response());
  appendEntry.mockResolvedValue(updated());
});

describe('useTargetExaminationCases', () => {
  it('keeps the latest refresh when an older request finishes last', async () => {
    const first = deferred<ReturnType<typeof response>>();
    listAll.mockReturnValueOnce(first.promise).mockResolvedValueOnce(response(caseFixture({ summary: 'Current' })));
    const { result } = renderHook(() => useTargetExaminationCases());
    await act(() => result.current.loadCases());
    await act(async () => first.resolve(response(caseFixture({ summary: 'Obsolete' }))));
    expect(result.current.selectedCase?.summary).toBe('Current');
    expect(result.current.loading).toBe(false);
  });

  it('invalidates the previous visit when returning to the same scope', async () => {
    const first = deferred<ReturnType<typeof response>>();
    listByScope.mockReturnValueOnce(first.promise);
    const { result, rerender } = renderHook(({ id }) => useTargetExaminationCases(scope(id)), {
      initialProps: { id: 'A' },
    });
    rerender({ id: 'B' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    listByScope.mockResolvedValueOnce(response(caseFixture({ summary: 'New visit' })));
    rerender({ id: 'A' });
    await waitFor(() => expect(result.current.selectedCase?.summary).toBe('New visit'));
    await act(async () => first.resolve(response(caseFixture({ summary: 'Old visit' }))));
    expect(result.current.selectedCase?.summary).toBe('New visit');
  });

  it('clears old records while the next scope is loading', async () => {
    listByScope.mockResolvedValueOnce(response(caseFixture()));
    const { result, rerender } = renderHook(({ id }) => useTargetExaminationCases(scope(id)), {
      initialProps: { id: 'A' },
    });
    await waitFor(() => expect(result.current.cases).toHaveLength(1));
    const pending = deferred<ReturnType<typeof response>>();
    listByScope.mockReturnValueOnce(pending.promise);
    rerender({ id: 'B' });
    expect(result.current.cases).toEqual([]);
    expect(result.current.selectedCase).toBeNull();
    expect(result.current.loading).toBe(true);
    await act(async () => pending.resolve(response()));
  });

  it.each(['resolve', 'reject'] as const)('ignores a departed mutation completing with %s', async (completion) => {
    const oldMutation = deferred<ReturnType<typeof updated>>();
    const currentMutation = deferred<ReturnType<typeof updated>>();
    appendEntry.mockReturnValueOnce(oldMutation.promise).mockReturnValueOnce(currentMutation.promise);
    const { result, rerender } = renderHook(({ id }) => useTargetExaminationCases(scope(id)), {
      initialProps: { id: 'A' },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let oldResult!: Promise<boolean>;
    act(() => {
      oldResult = result.current.commands.appendEntry(entry);
    });
    rerender({ id: 'B' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ id: 'A' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let currentResult!: Promise<boolean>;
    act(() => {
      currentResult = result.current.commands.appendEntry(entry);
    });
    await act(async () => {
      if (completion === 'resolve') oldMutation.resolve(updated());
      else oldMutation.reject(new Error('Old failure'));
      expect(await oldResult).toBe(false);
    });
    expect(listByScope).toHaveBeenCalledTimes(3);
    expect(result.current.selectedCase).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.saving).toBe(true);
    await act(async () => {
      currentMutation.resolve(updated());
      expect(await currentResult).toBe(true);
    });
    expect(result.current.saving).toBe(false);
  });

  it('recovers the list after a failed command and permits retry', async () => {
    const { result } = renderHook(() => useTargetExaminationCases());
    await waitFor(() => expect(result.current.loading).toBe(false));
    appendEntry.mockRejectedValueOnce(new Error('Acknowledgement lost'));
    listAll.mockResolvedValueOnce(response(caseFixture({ summary: 'Persisted before acknowledgement failed' })));
    await act(async () => {
      expect(await result.current.commands.appendEntry(entry)).toBe(false);
    });
    expect(result.current.selectedCase?.summary).toBe('Persisted before acknowledgement failed');
    expect(result.current.error).toBe('Acknowledgement lost');
    expect(result.current.saving).toBe(false);
    await act(async () => {
      expect(await result.current.commands.appendEntry(entry)).toBe(true);
    });
    expect(result.current.error).toBeNull();
  });

  it('preserves a command error when the recovery query also fails', async () => {
    const { result } = renderHook(() => useTargetExaminationCases());
    await waitFor(() => expect(result.current.loading).toBe(false));
    appendEntry.mockResolvedValueOnce({ success: false, error: { message: 'Case is closed' } });
    listAll.mockRejectedValueOnce(new Error('Query failed'));
    await act(async () => {
      expect(await result.current.commands.appendEntry(entry)).toBe(false);
    });
    expect(result.current.error).toBe('Case is closed');
    expect(result.current.loading).toBe(false);
    expect(result.current.saving).toBe(false);
  });

  it('does not reload after a command completes on an unmounted panel', async () => {
    const mutation = deferred<ReturnType<typeof updated>>();
    appendEntry.mockReturnValueOnce(mutation.promise);
    const { result, unmount } = renderHook(() => useTargetExaminationCases());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.commands.appendEntry(entry);
    });
    unmount();
    mutation.resolve(updated());
    expect(await pending).toBe(false);
    expect(listAll).toHaveBeenCalledTimes(1);
  });

  it('prevents overlapping commands from being submitted twice', async () => {
    const mutation = deferred<ReturnType<typeof updated>>();
    appendEntry.mockReturnValueOnce(mutation.promise);
    const { result } = renderHook(() => useTargetExaminationCases());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.commands.appendEntry(entry);
    });
    expect(await result.current.commands.appendEntry(entry)).toBe(false);
    expect(appendEntry).toHaveBeenCalledTimes(1);
    await act(async () => {
      mutation.resolve(updated());
      await pending;
    });
  });

  it('preserves a selection made while a command is pending', async () => {
    const second = caseFixture({ id: 'second', summary: 'Second case' });
    listAll.mockResolvedValue(response(second, caseFixture()));
    const mutation = deferred<ReturnType<typeof updated>>();
    appendEntry.mockReturnValueOnce(mutation.promise);
    const { result } = renderHook(() => useTargetExaminationCases());
    await waitFor(() => expect(result.current.selectedCaseId).toBe(CASE_ID));
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.commands.appendEntry(entry);
    });
    act(() => result.current.selectCase(second.id));
    await act(async () => {
      mutation.resolve(updated());
      await pending;
    });
    expect(result.current.selectedCaseId).toBe(second.id);
  });

  it('ignores requests from a discarded Strict Mode effect', async () => {
    const discarded = deferred<ReturnType<typeof response>>();
    listAll.mockReturnValueOnce(discarded.promise).mockResolvedValueOnce(response(caseFixture()));
    const { result } = renderHook(() => useTargetExaminationCases(), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.cases).toHaveLength(1));
    await act(async () => discarded.reject(new Error('Discarded request')));
    expect(result.current.error).toBeNull();
    expect(result.current.cases).toHaveLength(1);
  });
});
