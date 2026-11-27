// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDirectorMembershipEvents } from '@/renderer/presentation/hooks/useDirectorMembershipEvents';
import { localProgressControls } from '@/renderer/presentation/policies/localProgressControls';
import { useDirectorMembershipStore } from '@/renderer/presentation/stores/directorMembershipStore';
import { useLogStore } from '@/renderer/presentation/stores/logStore';
import { mqttService } from '@/renderer/services/mqttService';
import type { DirectorMembershipDto } from '@/shared/ipc/contracts';

vi.mock('@/renderer/services/mqttService', () => ({ mqttService: { getDirectorMembership: vi.fn() } }));

describe('Director membership hydration', () => {
  let push: (membership: DirectorMembershipDto) => void;
  let unsubscribe: ReturnType<typeof vi.fn<() => void>>;
  let resolveQuery: (membership: DirectorMembershipDto) => void;
  let rejectQuery: (error: Error) => void;

  beforeEach(() => {
    useDirectorMembershipStore.getState().beginHydration();
    useLogStore.getState().clearEntries();
    unsubscribe = vi.fn();
    vi.mocked(window.electronAPI.on.directorMembershipChanged).mockImplementation((callback) => {
      push = callback;
      return unsubscribe;
    });
    vi.mocked(mqttService.getDirectorMembership).mockImplementation(() => {
      expect(window.electronAPI.on.directorMembershipChanged).toHaveBeenCalled();
      return new Promise((resolve, reject) => {
        resolveQuery = resolve;
        rejectQuery = reject;
      });
    });
  });

  it.each([null, 'competition-1'])('starts locked and hydrates membership %s', async (competitionId) => {
    renderHook(() => useDirectorMembershipEvents());
    expect(localProgressControls(useDirectorMembershipStore.getState())).toEqual({
      allowed: false,
      reason: 'Director membership is not yet available',
    });
    expect(useDirectorMembershipStore.getState().hydrationFailed).toBe(false);
    await act(async () => {
      resolveQuery({ competitionId, revision: 0 });
    });
    expect(useDirectorMembershipStore.getState().membership).toEqual({ competitionId, revision: 0 });
    expect(localProgressControls(useDirectorMembershipStore.getState()).allowed).toBe(competitionId === null);
  });

  it.each([
    { queryId: null, pushId: 'competition-1' },
    { queryId: 'competition-1', pushId: null },
  ])('keeps a newer push over the delayed query ($pushId)', async ({ queryId, pushId }) => {
    renderHook(() => useDirectorMembershipEvents());
    act(() => {
      push({ competitionId: pushId, revision: 2 });
    });
    expect(localProgressControls(useDirectorMembershipStore.getState()).allowed).toBe(false);
    await act(async () => {
      resolveQuery({ competitionId: queryId, revision: 1 });
    });
    expect(useDirectorMembershipStore.getState().membership).toEqual({ competitionId: pushId, revision: 2 });
    act(() => {
      push({ competitionId: queryId, revision: 1 });
    });
    expect(useDirectorMembershipStore.getState().membership).toEqual({ competitionId: pushId, revision: 2 });
    expect(localProgressControls(useDirectorMembershipStore.getState()).allowed).toBe(pushId === null);
  });

  it('applies join and leave events after hydration', async () => {
    renderHook(() => useDirectorMembershipEvents());
    await act(async () => {
      resolveQuery({ competitionId: null, revision: 0 });
    });
    act(() => {
      push({ competitionId: 'competition-1', revision: 1 });
    });
    expect(localProgressControls(useDirectorMembershipStore.getState()).allowed).toBe(false);
    act(() => {
      push({ competitionId: null, revision: 2 });
    });
    expect(localProgressControls(useDirectorMembershipStore.getState()).allowed).toBe(true);
  });

  it('keeps a failed query locked, even after a push, and reports the error in the log', async () => {
    renderHook(() => useDirectorMembershipEvents());
    await act(async () => {
      rejectQuery(new Error('Membership unavailable'));
    });
    expect(useDirectorMembershipStore.getState().hydrationFailed).toBe(true);
    expect(localProgressControls(useDirectorMembershipStore.getState())).toEqual({
      allowed: false,
      reason: 'Director membership could not be loaded',
    });
    act(() => {
      push({ competitionId: null, revision: 2 });
    });
    expect(localProgressControls(useDirectorMembershipStore.getState()).allowed).toBe(false);
    expect(localProgressControls(useDirectorMembershipStore.getState()).reason).toBe(
      'Director membership could not be loaded',
    );
    expect(useLogStore.getState().entries).toEqual([
      expect.objectContaining({
        level: 'error',
        source: 'renderer',
        message: 'Failed to load Director membership: Membership unavailable',
      }),
    ]);
  });

  it('unsubscribes and ignores queries and callbacks from a prior mount', async () => {
    const { unmount } = renderHook(() => useDirectorMembershipEvents());
    const oldPush = push;
    const oldResolve = resolveQuery;
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
    renderHook(() => useDirectorMembershipEvents());
    await act(async () => {
      resolveQuery({ competitionId: 'competition-2', revision: 0 });
      oldPush({ competitionId: null, revision: 99 });
      oldResolve({ competitionId: null, revision: 100 });
    });
    expect(useDirectorMembershipStore.getState().membership).toEqual({ competitionId: 'competition-2', revision: 0 });
  });
  it('clears the failure for a new hydration attempt and recovers on query success', async () => {
    const { unmount } = renderHook(() => useDirectorMembershipEvents());
    await act(async () => {
      rejectQuery(new Error('Membership unavailable'));
    });
    expect(useDirectorMembershipStore.getState().hydrationFailed).toBe(true);
    unmount();
    renderHook(() => useDirectorMembershipEvents());
    expect(useDirectorMembershipStore.getState().hydrationFailed).toBe(false);
    expect(localProgressControls(useDirectorMembershipStore.getState()).reason).toBe(
      'Director membership is not yet available',
    );
    await act(async () => {
      resolveQuery({ competitionId: null, revision: 0 });
    });
    expect(localProgressControls(useDirectorMembershipStore.getState()).allowed).toBe(true);
  });

  it('ignores a query failure from an unmounted subscription', async () => {
    const { unmount } = renderHook(() => useDirectorMembershipEvents());
    const oldReject = rejectQuery;
    unmount();
    renderHook(() => useDirectorMembershipEvents());
    await act(async () => {
      resolveQuery({ competitionId: null, revision: 0 });
      oldReject(new Error('Old query failed'));
    });
    expect(useDirectorMembershipStore.getState().hydrationFailed).toBe(false);
    expect(localProgressControls(useDirectorMembershipStore.getState()).allowed).toBe(true);
    expect(useLogStore.getState().entries).toEqual([]);
  });
});
