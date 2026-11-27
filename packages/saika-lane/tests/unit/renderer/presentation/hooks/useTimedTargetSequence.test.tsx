// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useTimedTargetSequence } from '@/renderer/presentation/hooks/useTimedTargetSequence';
import { timedTargetService } from '@/renderer/services/timedTargetService';
import type { TimedTargetStateDto } from '@/shared/ipc/contracts';

import { emit } from '../../../../helpers/mockElectronAPI';

vi.mock('@/renderer/services/timedTargetService', () => ({
  timedTargetService: { getState: vi.fn(), cancel: vi.fn() },
}));

const firing: TimedTargetStateDto = {
  sequenceId: '11111111-1111-4111-8111-111111111111',
  competitionId: '22222222-2222-4222-8222-222222222222',
  programId: 'P25_MATCH_RAPID_8',
  programLabel: 'Rapid fire 8 s',
  purpose: 'MATCH',
  stageIndex: 1,
  seriesIndex: 0,
  targetProfileId: 'ISSF_25M_RAPID_FIRE',
  ruleReference: '8.7.6',
  phase: 'FIRING',
  signal: 'GREEN',
  shotWindowOpen: true,
  exposureIndex: 0,
  exposureCount: 1,
  acceptedShotsInExposure: 0,
  loadAt: '2026-09-01T00:00:00.000Z',
  attentionAt: '2026-09-01T00:01:00.000Z',
  completesAt: '2026-09-01T00:01:15.000Z',
  nextLoadAllowedAt: '2026-09-01T00:02:00.000Z',
  nextTransitionAt: '2026-09-01T00:01:15.000Z',
  terminalReason: null,
};

it('keeps a sequence pushed while the initial query is still pending', async () => {
  let resolveState!: (state: TimedTargetStateDto | null) => void;
  vi.mocked(timedTargetService.getState).mockReturnValue(
    new Promise((resolve) => {
      resolveState = resolve;
    }),
  );
  const { result } = renderHook(() => useTimedTargetSequence());

  act(() => emit('timedTargetSequenceChanged', firing));
  await act(async () => resolveState(null));

  expect(result.current.sequence).toEqual(firing);
});

it('shows no sequence when the initial query fails', async () => {
  vi.mocked(timedTargetService.getState).mockRejectedValue(new Error('Main process is restarting'));
  const { result } = renderHook(() => useTimedTargetSequence());

  await act(async () => {});

  expect(result.current.sequence).toBeNull();
  expect(result.current.remaining).toBeNull();
  expect(result.current.cancelError).toBeNull();
});

it('cancels the running sequence for an emergency and clears the failure on the next state', async () => {
  vi.mocked(timedTargetService.getState).mockResolvedValue(firing);
  vi.mocked(timedTargetService.cancel).mockRejectedValue(new Error('The sequence already completed'));
  const { result } = renderHook(() => useTimedTargetSequence());
  await act(async () => {});
  expect(result.current.sequence).toEqual(firing);

  await act(async () => result.current.cancel());

  expect(timedTargetService.cancel).toHaveBeenCalledExactlyOnceWith({
    sequenceId: firing.sequenceId,
    reason: 'Emergency local cancellation',
  });
  expect(result.current.cancelError).toBe('The sequence already completed');

  act(() => emit('timedTargetSequenceChanged', { ...firing, phase: 'CANCELLED', shotWindowOpen: false }));

  expect(result.current.cancelError).toBeNull();
  expect(result.current.sequence).toBeNull();
});

it('does not cancel when no sequence is running', async () => {
  vi.mocked(timedTargetService.getState).mockResolvedValue(null);
  const { result } = renderHook(() => useTimedTargetSequence());
  await act(async () => {});

  act(() => result.current.cancel());

  expect(timedTargetService.cancel).not.toHaveBeenCalled();
});
