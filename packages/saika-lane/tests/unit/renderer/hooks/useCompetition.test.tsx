// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCompetition } from '@/renderer/presentation/hooks/useCompetition';
import { competitionService } from '@/renderer/services/competitionService';

vi.mock('@/renderer/services/competitionService', () => ({
  competitionService: {
    startStage: vi.fn(),
    endStage: vi.fn(),
    startNextSeries: vi.fn(),
    advanceStage: vi.fn(),
  },
}));

const actions = [
  ['startStage', 'An error occurred while starting preparation'],
  ['endStage', 'An error occurred while ending sighting'],
  ['startNextSeries', 'An error occurred while starting the match series'],
  ['advanceStage', 'An error occurred while advancing the stage'],
] as const;

async function rejection(run: () => Promise<unknown>): Promise<Error | undefined> {
  let thrown: Error | undefined;
  await act(async () => {
    try {
      await run();
    } catch (error) {
      thrown = error as Error;
    }
  });
  return thrown;
}

describe('useCompetition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts a stage and returns its session', async () => {
    vi.mocked(competitionService.startStage).mockResolvedValue({ sessionId: 'sess-new' });
    const { result } = renderHook(() => useCompetition());

    let started: { sessionId: string } | undefined;
    await act(async () => {
      started = await result.current.startStage('comp-123');
    });

    expect(competitionService.startStage).toHaveBeenCalledExactlyOnceWith({ competitionId: 'comp-123' });
    expect(started).toEqual({ sessionId: 'sess-new' });
  });

  it.each(actions)('%s sends the competition id', async (action) => {
    vi.mocked(competitionService[action]).mockResolvedValue(undefined as never);
    const { result } = renderHook(() => useCompetition());

    await act(async () => {
      await result.current[action]('comp-123');
    });

    expect(competitionService[action]).toHaveBeenCalledExactlyOnceWith({ competitionId: 'comp-123' });
  });

  it.each(actions)('%s rejects with the service error', async (action) => {
    vi.mocked(competitionService[action]).mockRejectedValue(new Error('Restore or finish the saved run'));
    const { result } = renderHook(() => useCompetition());

    const thrown = await rejection(() => result.current[action]('comp-123'));

    expect(thrown?.message).toBe('Restore or finish the saved run');
  });

  it.each(actions)('%s replaces a rejection that is not an Error with "%s"', async (action, message) => {
    vi.mocked(competitionService[action]).mockRejectedValue('string error');
    const { result } = renderHook(() => useCompetition());

    const thrown = await rejection(() => result.current[action]('comp-123'));

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown?.message).toBe(message);
  });

  it('can retry after a failure', async () => {
    vi.mocked(competitionService.advanceStage)
      .mockRejectedValueOnce(new Error('Temporary error'))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useCompetition());

    expect((await rejection(() => result.current.advanceStage('comp-123')))?.message).toBe('Temporary error');
    expect(await rejection(() => result.current.advanceStage('comp-123'))).toBeUndefined();
    expect(competitionService.advanceStage).toHaveBeenCalledTimes(2);
  });
});
