import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventBusProvider } from '@/renderer/events/EventBusProvider';
import { TestEventBus } from '@/renderer/events/TestEventBus';
import { useCompetitionEvidence } from '@/renderer/presentation/features/competition-control/useCompetitionEvidence';
import { useMqttControlSnapshot } from '@/renderer/presentation/features/competition-control/useMqttControlSnapshot';
import type { FiringWindowViolationDto, MqttControlSnapshotDto } from '@/shared/ipc/contracts';

const { getControlState, getFiringWindowViolations, getShotObservationEvidence } = vi.hoisted(() => ({
  getControlState: vi.fn(),
  getFiringWindowViolations: vi.fn(),
  getShotObservationEvidence: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({
  mqttService: { getControlState, getFiringWindowViolations, getShotObservationEvidence },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
const snapshot = (brokerUrl: string | null): MqttControlSnapshotDto => ({
  connected: brokerUrl !== null,
  brokerUrl,
  activeCompetitionId: null,
  lanes: [],
  competitions: [],
  lastCommand: null,
});
const violation = (competitionId: string): FiringWindowViolationDto => ({
  id: '11111111-1111-4111-8111-111111111111',
  competitionId,
  laneId: '22222222-2222-4222-8222-222222222222',
  sessionId: '33333333-3333-4333-8333-333333333333',
  shotId: '44444444-4444-4444-8444-444444444444',
  observationId: '55555555-5555-4555-8555-555555555555',
  shotMode: 'MATCH',
  policyRuleId: 'after-stop',
  kind: 'AFTER_MATCH_STOP',
  ruleReference: 'ISSF 6.11',
  reviewGuidance: 'Review the firing window',
  timestampSource: 'RECEIVED_AT',
  clockToleranceMilliseconds: 0,
  evaluatedShotAt: '2026-09-10T00:00:00Z',
  firedAt: '2026-09-10T00:00:00Z',
  receivedAt: '2026-09-10T00:00:00Z',
  observedAt: '2026-09-10T00:00:00Z',
  detectedAt: '2026-09-10T00:00:00Z',
  decisiveBoundaryId: '66666666-6666-4666-8666-666666666666',
});
const response = <T,>(data: T) => ({ success: true as const, data });
let bus: TestEventBus;
const wrapper = ({ children }: { children: ReactNode }) => <EventBusProvider bus={bus}>{children}</EventBusProvider>;

beforeEach(() => {
  vi.resetAllMocks();
  bus = new TestEventBus();
  getControlState.mockResolvedValue(response(snapshot(null)));
  getFiringWindowViolations.mockResolvedValue(response([]));
  getShotObservationEvidence.mockResolvedValue(response([]));
});

describe('MQTT control snapshot ownership', () => {
  it('keeps a live broker update when an older refresh returns', async () => {
    const pending = deferred<ReturnType<typeof response<MqttControlSnapshotDto>>>();
    getControlState.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(useMqttControlSnapshot, { wrapper });
    act(() => bus.emit('mqttControlStateChanged', snapshot('mqtt://current')));
    await act(async () => pending.resolve(response(snapshot('mqtt://old'))));
    expect(result.current.snapshot.brokerUrl).toBe('mqtt://current');
  });

  it('accepts only the newest concurrent refresh', async () => {
    const pending = deferred<ReturnType<typeof response<MqttControlSnapshotDto>>>();
    getControlState.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(snapshot('mqtt://latest')));
    const { result } = renderHook(useMqttControlSnapshot, { wrapper });
    await act(() => result.current.refresh());
    await act(async () => pending.resolve(response(snapshot('mqtt://old'))));
    expect(result.current.snapshot.brokerUrl).toBe('mqtt://latest');
  });

  it('removes listeners on unmount with an outstanding request', async () => {
    const pending = deferred<ReturnType<typeof response<MqttControlSnapshotDto>>>();
    getControlState.mockReturnValueOnce(pending.promise);
    const { result, unmount } = renderHook(useMqttControlSnapshot, { wrapper });
    expect(bus.getSubscriptionCount()).toBe(1);
    unmount();
    expect(bus.getSubscriptionCount()).toBe(0);
    await result.current.refresh();
    expect(getControlState).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(response(snapshot('mqtt://old'))));
  });

  it('restarts subscriptions and discards the first request during Strict Mode replay', async () => {
    const pending = deferred<ReturnType<typeof response<MqttControlSnapshotDto>>>();
    getControlState.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(snapshot('mqtt://current')));
    const { result, unmount } = renderHook(useMqttControlSnapshot, {
      wrapper,
      reactStrictMode: true,
    });
    await waitFor(() => expect(result.current.snapshot.brokerUrl).toBe('mqtt://current'));
    expect(bus.getSubscriptionCount()).toBe(1);
    await act(async () => pending.resolve(response(snapshot('mqtt://old'))));
    expect(result.current.snapshot.brokerUrl).toBe('mqtt://current');
    unmount();
    expect(bus.getSubscriptionCount()).toBe(0);
  });
});

describe('competition evidence ownership', () => {
  it('deduplicates live events and prevents an older query from erasing them', async () => {
    const pending = deferred<ReturnType<typeof response<FiringWindowViolationDto[]>>>();
    getFiringWindowViolations.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useCompetitionEvidence('A'), { wrapper });
    act(() => {
      bus.emit('firingWindowViolationDetected', violation('B'));
      bus.emit('firingWindowViolationDetected', violation('A'));
      bus.emit('firingWindowViolationDetected', violation('A'));
    });
    await act(async () => pending.resolve(response([])));
    expect(result.current.firingWindowViolations).toEqual([violation('A')]);
  });

  it('discards an old scope query after switching away and back', async () => {
    const pending = deferred<ReturnType<typeof response<FiringWindowViolationDto[]>>>();
    getFiringWindowViolations.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useCompetitionEvidence(id), {
      initialProps: { id: 'A' as string | null },
      wrapper,
    });
    rerender({ id: 'B' });
    rerender({ id: 'A' });
    await act(async () => pending.resolve(response([violation('A')])));
    expect(result.current.firingWindowViolations).toEqual([]);
  });

  it('clears evidence and stops querying when there is no selected competition', async () => {
    getFiringWindowViolations.mockResolvedValueOnce(response([violation('A')]));
    const { result, rerender, unmount } = renderHook(({ id }: { id: string | null }) => useCompetitionEvidence(id), {
      initialProps: { id: 'A' as string | null },
      wrapper,
    });
    await waitFor(() => expect(result.current.firingWindowViolations).toHaveLength(1));
    rerender({ id: null });
    expect(result.current.firingWindowViolations).toEqual([]);
    expect(result.current.shotObservationEvidence).toEqual([]);
    expect(getFiringWindowViolations).toHaveBeenCalledTimes(1);
    expect(getShotObservationEvidence).toHaveBeenCalledTimes(1);
    unmount();
    expect(bus.getSubscriptionCount()).toBe(0);
  });
});
