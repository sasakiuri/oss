// SPDX-License-Identifier: MIT
import type { HardwareStatePayload } from '@/shared/mqtt';

import type { DirectorMqttState } from './DirectorMqttState';

// Lane sends heartbeats every 60 seconds. Allow two missed reports and 30 seconds of tolerance.
const HARDWARE_HEARTBEAT_STALE_AFTER_MS = 150_000;

/** Owns heartbeat deadlines; projections keep the original report timestamp when marked offline. */
export class LaneHardwareMonitor {
  private hardwareStaleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly state: Pick<DirectorMqttState, 'getLane' | 'updateLane'>) {}

  observe(state: HardwareStatePayload): HardwareStatePayload {
    this.clearHardwareStaleTimer(state.laneId);
    if (state.connection.status === 'offline') return state;

    const ageMs = Math.max(0, Date.now() - Date.parse(state.publishedAt));
    const remainingFreshMs = HARDWARE_HEARTBEAT_STALE_AFTER_MS - ageMs;
    if (remainingFreshMs <= 0) return this.offlineHardwareState(state);

    const timer = setTimeout(() => {
      if (this.hardwareStaleTimers.get(state.laneId) !== timer) return;
      this.hardwareStaleTimers.delete(state.laneId);
      const current = this.state.getLane(state.laneId);
      if (!current?.hardware || current.hardware.connection.status === 'offline') return;
      this.state.updateLane(state.laneId, {
        hardware: this.offlineHardwareState(current.hardware),
      });
    }, remainingFreshMs);
    timer.unref();
    this.hardwareStaleTimers.set(state.laneId, timer);
    return state;
  }

  private offlineHardwareState(state: HardwareStatePayload): HardwareStatePayload {
    return {
      ...state,
      connection: { status: 'offline' },
    };
  }

  private clearHardwareStaleTimer(laneId: string): void {
    const timer = this.hardwareStaleTimers.get(laneId);
    if (!timer) return;
    clearTimeout(timer);
    this.hardwareStaleTimers.delete(laneId);
  }

  clear(): void {
    for (const timer of this.hardwareStaleTimers.values()) clearTimeout(timer);
    this.hardwareStaleTimers.clear();
  }
}
