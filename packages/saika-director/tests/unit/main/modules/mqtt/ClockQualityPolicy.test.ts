import { describe, expect, it } from 'vitest';

import { ClockQualityPolicy } from '@/main/modules/mqtt/domain/ClockQualityPolicy';

describe('ClockQualityPolicy', () => {
  it('derives NTP-style offset, round-trip time and uncertainty from four timestamps', () => {
    const policy = new ClockQualityPolicy({
      mode: 'REQUIRED',
      maxAbsoluteOffsetMilliseconds: 50,
      maxUncertaintyMilliseconds: 25,
      maxSampleAgeMilliseconds: 1_000,
    });

    const assessment = policy.assess(
      {
        directorSentAtMs: 1_000,
        laneReceivedAtMs: 1_020,
        laneSentAtMs: 1_024,
        directorReceivedAtMs: 1_044,
      },
      new Date(1_044),
    );

    expect(assessment).toMatchObject({
      status: 'GOOD',
      offsetMilliseconds: 0,
      roundTripMilliseconds: 40,
      uncertaintyMilliseconds: 20,
      usableForTimedCommands: true,
    });
  });

  it('keeps degraded samples advisory unless REQUIRED mode is selected', () => {
    const timestamps = {
      directorSentAtMs: 1_000,
      laneReceivedAtMs: 1_500,
      laneSentAtMs: 1_501,
      directorReceivedAtMs: 1_041,
    };
    expect(new ClockQualityPolicy({ mode: 'ADVISORY' }).assess(timestamps, new Date(1_041))).toMatchObject({
      status: 'DEGRADED',
      usableForTimedCommands: true,
    });
    expect(new ClockQualityPolicy({ mode: 'REQUIRED' }).assess(timestamps, new Date(1_041))).toMatchObject({
      status: 'DEGRADED',
      usableForTimedCommands: false,
    });
  });

  it('expires a previously good sample in REQUIRED mode', () => {
    const policy = new ClockQualityPolicy({ mode: 'REQUIRED', maxSampleAgeMilliseconds: 1_000 });
    const assessment = policy.assess(
      {
        directorSentAtMs: 1_000,
        laneReceivedAtMs: 1_010,
        laneSentAtMs: 1_011,
        directorReceivedAtMs: 1_021,
      },
      new Date(1_021),
    );

    expect(policy.isUsable(assessment, new Date(2_022))).toBe(false);
  });
});
