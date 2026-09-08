import { describe, expect, it } from 'vitest';

import {
  TimedTargetReadinessPolicy,
  type TimedTargetReadinessFacts,
  type TimedTargetReadinessSettings,
} from '@/main/modules/mqtt/domain/TimedTargetReadinessPolicy';

const now = new Date('2026-09-08T00:00:00.000Z');
const ready: TimedTargetReadinessFacts = {
  connected: true,
  reportedAt: now.toISOString(),
  enforcementMode: 'REQUIRED',
  shotTiming: { mode: 'BOUNDED', maximumReceiptDelayMilliseconds: 100, clockUncertaintyMilliseconds: 10 },
  physicalActuation: 'INTEGRATED',
  physicalFeedback: 'INTEGRATED',
};
const settings: TimedTargetReadinessSettings = {
  windowEnforcement: 'REQUIRED',
  boundedShotTiming: 'ADVISORY',
  physicalSignals: 'DISABLED',
};

describe('TimedTargetReadinessPolicy', () => {
  it('evaluates independent checks and allows officials to use external signals', () => {
    const policy = new TimedTargetReadinessPolicy(() => settings);
    expect(policy.assess('lane', { ...ready, physicalActuation: 'NOT_INTEGRATED' }, now)).toEqual([]);
    expect(policy.assess('lane', { ...ready, enforcementMode: 'DISABLED', shotTiming: undefined }, now)).toEqual([
      expect.objectContaining({ code: 'TIMED_TARGET_ENFORCEMENT', blocking: true }),
      expect.objectContaining({ code: 'TIMED_TARGET_SHOT_TIMING', blocking: false }),
    ]);
  });

  it.each([
    { reportedAt: undefined },
    { reportedAt: '2026-09-07T23:57:29.999Z' },
    { reportedAt: '2026-09-08T00:00:01.000Z' },
    { connected: false },
  ])('does not trust missing, stale, future, or disconnected reports (%j)', (change) => {
    const policy = new TimedTargetReadinessPolicy(() => settings);
    expect(policy.assess('lane', { ...ready, ...change }, now)).toHaveLength(2);
  });

  it('requires both physical directions and known bounds, and reads changed policies', () => {
    let current: TimedTargetReadinessSettings = { ...settings, physicalSignals: 'REQUIRED' };
    const policy = new TimedTargetReadinessPolicy(() => current);
    const facts = {
      ...ready,
      physicalFeedback: 'NOT_INTEGRATED' as const,
      shotTiming: { ...ready.shotTiming!, maximumReceiptDelayMilliseconds: null },
    };
    expect(policy.assess('lane', facts, now)).toEqual([
      expect.objectContaining({ code: 'TIMED_TARGET_SHOT_TIMING', blocking: false }),
      expect.objectContaining({ code: 'TIMED_TARGET_PHYSICAL_SIGNALS', blocking: true }),
    ]);
    current = { ...current, physicalSignals: 'DISABLED', boundedShotTiming: 'REQUIRED' };
    expect(policy.assess('lane', facts, now)).toEqual([
      expect.objectContaining({ code: 'TIMED_TARGET_SHOT_TIMING', blocking: true }),
    ]);
  });
});
