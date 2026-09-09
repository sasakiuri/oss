// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DirectorMqttState } from '@/main/modules/mqtt/application/DirectorMqttState';
import { LaneHardwareMonitor } from '@/main/modules/mqtt/application/LaneHardwareMonitor';
import type { HardwareStatePayload } from '@/shared/mqtt';

function setup() {
  const state = new DirectorMqttState(1000, vi.fn());
  const monitor = new LaneHardwareMonitor(state);
  const report = (publishedAt = new Date().toISOString()) => {
    const hardware: HardwareStatePayload = {
      laneId: 'lane',
      laneAlias: 'Lane',
      appVersion: '0.3.0',
      connection: { status: 'connected' },
      publishedAt,
    };
    state.updateLane('lane', { hardware: monitor.observe(hardware) });
    return hardware;
  };
  return { state, monitor, report };
}

describe('LaneHardwareMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-09T00:05:00.000Z');
  });
  afterEach(() => vi.useRealTimers());

  it('treats an old retained heartbeat as offline immediately', () => {
    const { state, report } = setup();
    report('2026-09-09T00:00:00.000Z');
    expect(state.getLane('lane')?.hardware?.connection.status).toBe('offline');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces a heartbeat deadline and preserves the last report timestamp when it expires', async () => {
    const { state, report } = setup();
    report();
    await vi.advanceTimersByTimeAsync(60_000);
    const latest = report();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(state.getLane('lane')?.hardware?.connection.status).toBe('connected');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state.getLane('lane')?.hardware).toEqual({ ...latest, connection: { status: 'offline' } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels every heartbeat deadline on session shutdown', async () => {
    const { state, monitor, report } = setup();
    const hardware = report();
    monitor.clear();
    await vi.advanceTimersByTimeAsync(150_000);
    expect(state.getLane('lane')?.hardware).toEqual(hardware);
    expect(vi.getTimerCount()).toBe(0);
  });
});
