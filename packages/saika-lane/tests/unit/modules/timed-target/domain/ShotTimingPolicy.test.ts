// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { BoundedShotTimingPolicy } from '@/main/modules/timed-target/domain/ShotTimingPolicy';
import { buildTimedTargetSchedule } from '@/main/modules/timed-target/domain/TimedTargetSchedule';
import { DEFAULT_TIMED_TARGET_TIMING_SETTINGS } from '@/shared/mqtt/TimedTargetTimingSettings';

const schedule = buildTimedTargetSchedule({
  sequenceId: 'sequence',
  competitionId: 'competition',
  stageIndex: 1,
  seriesIndex: 0,
  targetProfileId: 'rapid',
  loadAt: new Date('2026-09-08T00:00:00Z'),
  program: {
    id: 'program',
    label: 'Rapid fire',
    purpose: 'MATCH',
    ruleReference: '6.4.13',
    loadPreparationSeconds: 60,
    attentionDelayMilliseconds: 7000,
    attentionToleranceMilliseconds: 100,
    betweenExposuresMilliseconds: 7000,
    minimumPauseAfterSeconds: 60,
    exposures: [0, 1].map(() => ({
      nominalDurationMilliseconds: 3000,
      signalExtensionMilliseconds: 100,
      recordingAfterTimeMilliseconds: 200,
      maximumShots: 1,
    })),
  },
});
const firedAt = (offset: number) => new Date(schedule.exposures[0]!.greenAt.getTime() + offset);

describe('Bounded shot timing', () => {
  const policy = new BoundedShotTimingPolicy(() => ({
    mode: 'BOUNDED',
    maximumReceiptDelayMilliseconds: 300,
    clockUncertaintyMilliseconds: 20,
  }));
  it('holds a delayed receipt crossing the close boundary instead of treating it as a late shot', () => {
    expect(policy.assess({ firedAt: firedAt(3450), timestampSource: 'LANE_RECEIPT' }, schedule)).toMatchObject({
      requiresReview: true,
    });
    expect(policy.assess({ firedAt: firedAt(3700), timestampSource: 'LANE_RECEIPT' }, schedule)).toMatchObject({
      requiresReview: false,
    });
    expect(schedule.exposures[0]!.recordingClosesAt.getTime() - schedule.exposures[0]!.greenAt.getTime()).toBe(3300);
  });
  it('holds early-boundary and multi-exposure ambiguity, but allows certain inside and outside observations', () => {
    expect(policy.assess({ firedAt: firedAt(100), timestampSource: 'LANE_RECEIPT' }, schedule).requiresReview).toBe(
      true,
    );
    expect(policy.assess({ firedAt: firedAt(1000), timestampSource: 'LANE_RECEIPT' }, schedule).requiresReview).toBe(
      false,
    );
    expect(policy.assess({ firedAt: firedAt(-1000), timestampSource: 'LANE_RECEIPT' }, schedule).requiresReview).toBe(
      false,
    );
    const wide = new BoundedShotTimingPolicy(() => ({
      mode: 'BOUNDED',
      maximumReceiptDelayMilliseconds: 11000,
      clockUncertaintyMilliseconds: 0,
    }));
    expect(wide.assess({ firedAt: firedAt(11500), timestampSource: 'LANE_RECEIPT' }, schedule).requiresReview).toBe(
      true,
    );
  });
  it('does not infer a trusted clock merely from DEVICE_REPORTED provenance', () => {
    const unknown = new BoundedShotTimingPolicy(() => DEFAULT_TIMED_TARGET_TIMING_SETTINGS);
    expect(
      unknown.assess({ firedAt: firedAt(1000), timestampSource: 'DEVICE_REPORTED' }, schedule).requiresReview,
    ).toBe(true);
    expect(policy.assess({ firedAt: firedAt(1000) }, schedule).requiresReview).toBe(true);
    const device = new BoundedShotTimingPolicy(() => ({
      mode: 'BOUNDED',
      maximumReceiptDelayMilliseconds: null,
      clockUncertaintyMilliseconds: 0,
    }));
    expect(device.assess({ firedAt: firedAt(3299), timestampSource: 'DEVICE_REPORTED' }, schedule).requiresReview).toBe(
      false,
    );
    expect(device.assess({ firedAt: firedAt(3300), timestampSource: 'DEVICE_REPORTED' }, schedule).requiresReview).toBe(
      false,
    );
  });
  it('keeps supplied-timestamp operation independent of the uncertainty bounds', () => {
    const timestamp = new BoundedShotTimingPolicy(() => ({
      ...DEFAULT_TIMED_TARGET_TIMING_SETTINGS,
      mode: 'TIMESTAMP',
    }));
    expect(timestamp.assess({ firedAt: firedAt(3300) }, schedule).requiresReview).toBe(false);
  });
});
