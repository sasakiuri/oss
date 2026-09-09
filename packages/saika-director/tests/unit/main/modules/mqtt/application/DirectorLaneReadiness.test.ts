// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DirectorLaneReadiness } from '@/main/modules/mqtt/application/DirectorLaneReadiness';
import type { CommandExecutionResult } from '@/main/modules/mqtt/application/DirectorMqttTypes';
import { ClockQualityPolicy } from '@/main/modules/mqtt/domain/ClockQualityPolicy';
import { LaneTimingEvidencePolicy } from '@/main/modules/mqtt/domain/LaneTimingEvidencePolicy';
import { TimedTargetReadinessPolicy } from '@/main/modules/mqtt/domain/TimedTargetReadinessPolicy';
import type { HardwareStatePayload } from '@/shared/mqtt';

const now = new Date('2026-09-09T00:00:00.000Z');
const source = { isReady: () => true, getHardware: () => undefined };

function clockResult(status: 'done' | 'timeout' = 'done'): CommandExecutionResult {
  return {
    action: 'probe-clock',
    commandId: 'probe',
    success: status === 'done',
    lanes: [
      {
        laneId: 'lane',
        status,
        data: {
          directorSentAt: now.toISOString(),
          laneReceivedAt: now.toISOString(),
          laneSentAt: now.toISOString(),
        },
      },
    ],
  };
}

describe('DirectorLaneReadiness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it('expires clock approval at read time and reports the missing Lane independently', () => {
    const readiness = new DirectorLaneReadiness(
      source,
      new ClockQualityPolicy({ mode: 'REQUIRED', maxSampleAgeMilliseconds: 100 }),
    );
    readiness.recordClockProbe('lane', now, clockResult());
    expect(readiness.getClockStartIssues(['lane'])).toEqual([]);
    expect(readiness.getClockStartIssues(['missing'])).toEqual([expect.objectContaining({ blocking: true })]);
    vi.setSystemTime(now.getTime() + 101);
    expect(readiness.getClockQuality('lane')).toMatchObject({ status: 'GOOD', usableForTimedCommands: false });
    expect(() => readiness.assertTimedCommandReadiness(['lane'])).toThrow('Fresh GOOD clock-quality samples');
  });

  it.each(['policy change', 'session reset'])('invalidates previous clock approval on %s', (operation) => {
    const readiness = new DirectorLaneReadiness(source, new ClockQualityPolicy({ mode: 'REQUIRED' }));
    readiness.recordClockProbe('lane', now, clockResult());
    if (operation === 'policy change') readiness.setClockQualityPolicy(new ClockQualityPolicy({ mode: 'REQUIRED' }));
    else readiness.reset();
    expect(readiness.getClockQuality('lane')).toBeNull();
    expect(readiness.getClockQuality()).toEqual({});
    expect(() => readiness.assertTimedCommandReadiness(['lane'])).toThrow('Fresh GOOD clock-quality samples');
  });

  it('replaces a previous good sample when a probe times out or refers to a different request', () => {
    const readiness = new DirectorLaneReadiness(source, new ClockQualityPolicy({ mode: 'REQUIRED' }));
    readiness.recordClockProbe('lane', now, clockResult());
    const timeout = readiness.recordClockProbe('lane', now, clockResult('timeout'));
    expect(timeout.assessment).toMatchObject({ status: 'UNAVAILABLE', guidance: 'The Lane clock probe timed out.' });
    const mismatch = readiness.recordClockProbe('lane', new Date(now.getTime() + 1), clockResult());
    expect(mismatch.assessment.status).toBe('UNAVAILABLE');
  });

  it('keeps advisory clock issues visible without blocking timed commands', () => {
    const readiness = new DirectorLaneReadiness(source);
    expect(readiness.getClockStartIssues(['lane'])).toEqual([expect.objectContaining({ blocking: false })]);
    expect(() => readiness.assertTimedCommandReadiness(['lane'])).not.toThrow();
    readiness.setClockQualityPolicy(new ClockQualityPolicy({ mode: 'DISABLED' }));
    expect(readiness.getClockStartIssues(['lane'])).toEqual([]);
  });

  it('reads current hardware and broker readiness for each start check', () => {
    let ready = true;
    let hardware: HardwareStatePayload | null = {
      laneId: 'lane',
      laneAlias: 'Lane',
      appVersion: '0.3.0',
      publishedAt: now.toISOString(),
      connection: { status: 'connected' },
      capabilities: {
        competitionProtocolVersions: [1],
        rulePacks: [],
        timedTargetPolicy: { enforcementMode: 'REQUIRED' },
      },
    };
    const readiness = new DirectorLaneReadiness({ isReady: () => ready, getHardware: () => hardware });
    readiness.setTimedTargetReadinessPolicy(
      new TimedTargetReadinessPolicy(() => ({
        windowEnforcement: 'REQUIRED',
        boundedShotTiming: 'DISABLED',
        physicalSignals: 'DISABLED',
      })),
    );
    expect(() => readiness.assertTimedTargetReadiness(['lane'])).not.toThrow();
    ready = false;
    expect(() => readiness.assertTimedTargetReadiness(['lane'])).toThrow('Timed target readiness');
    ready = true;
    hardware = null;
    expect(() => readiness.assertTimedTargetReadiness(['lane'])).toThrow('Timed target readiness');
    readiness.setTimingEvidencePolicy(new LaneTimingEvidencePolicy(() => 'REQUIRED'));
    expect(() => readiness.assertTimedCommandReadiness(['lane'])).toThrow('Timing evidence');
  });
});
