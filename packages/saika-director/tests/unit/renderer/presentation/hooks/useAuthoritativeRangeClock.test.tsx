import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventBusProvider } from '@/renderer/events/EventBusProvider';
import { useAuthoritativeRangeClock } from '@/renderer/presentation/hooks/useAuthoritativeRangeClock';
import { mqttService } from '@/renderer/services';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';

import { fail, ok } from '../../../../helpers/renderer/serviceResponses';
import { TestEventBus } from '../../../../helpers/renderer/TestEventBus';

vi.mock('@/renderer/services', async () => (await import('../../../../helpers/renderer/mockServices')).mockServices());
const { getControlState } = vi.mocked(mqttService);

const snapshot = (activeCompetitionId: string): MqttControlSnapshotDto => ({
  connected: true,
  brokerUrl: 'mqtt://broker',
  activeCompetitionId,
  lanes: [],
  competitions: [],
  lastCommand: null,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderClock(bus = new TestEventBus()) {
  const wrapper = ({ children }: { children: ReactNode }) => <EventBusProvider bus={bus}>{children}</EventBusProvider>;
  return { bus, ...renderHook(() => useAuthoritativeRangeClock(), { wrapper }) };
}

describe('useAuthoritativeRangeClock', () => {
  beforeEach(() => vi.resetAllMocks());

  it('projects the initial snapshot at the time it arrived', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5_000);
    getControlState.mockResolvedValue(ok(snapshot('from-query')));
    const { result } = renderClock();

    await waitFor(() => expect(result.current.competitionId).toBe('from-query'));
    expect(result.current).toMatchObject({ synchronized: true, status: 'UNAVAILABLE', observedAtMs: 5_000 });
    vi.restoreAllMocks();
  });

  it('keeps a live snapshot when an older initial query finishes later', async () => {
    const initial = deferred<ReturnType<typeof ok<MqttControlSnapshotDto>>>();
    getControlState.mockReturnValue(initial.promise);
    const { bus, result } = renderClock();

    act(() => bus.emit('mqttControlStateChanged', snapshot('live')));
    await act(async () => {
      initial.resolve(ok(snapshot('stale')));
      await initial.promise;
    });

    expect(result.current.competitionId).toBe('live');
  });

  it('stays unavailable after a failed or rejected initial query', async () => {
    getControlState.mockResolvedValueOnce(fail('Broker state unavailable'));
    const failed = renderClock();
    getControlState.mockRejectedValueOnce(new Error('IPC closed'));
    const rejected = renderClock();
    await act(async () => {
      await Promise.resolve();
    });

    for (const { result } of [failed, rejected]) {
      expect(result.current).toMatchObject({ status: 'UNAVAILABLE', competitionId: null, synchronized: false });
    }
    expect(getControlState).toHaveBeenCalledTimes(2);
  });
});
