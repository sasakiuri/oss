// SPDX-License-Identifier: MIT
import type { TimedTargetTimingSettings } from '@/shared/mqtt/TimedTargetTimingSettings';
import type { ShotTimestampSource } from '@/shared/types/ShotTimestampSource';

import type { TimedTargetSchedule } from './TimedTargetSchedule';

export interface TimedTargetShotTime {
  readonly firedAt: Date;
  readonly timestampSource?: ShotTimestampSource;
}

export interface ShotTimingAssessment {
  readonly requiresReview: boolean;
  readonly reason: string;
}

export interface IShotTimingPolicy {
  readonly settings: TimedTargetTimingSettings;
  assess(shot: TimedTargetShotTime, schedule: TimedTargetSchedule): ShotTimingAssessment;
}

/** Uses an interval of possible shot times; never extends a rule-defined recording window. */
export class BoundedShotTimingPolicy implements IShotTimingPolicy {
  constructor(private readonly readSettings: () => TimedTargetTimingSettings) {}

  get settings(): TimedTargetTimingSettings {
    return this.readSettings();
  }

  assess(shot: TimedTargetShotTime, schedule: TimedTargetSchedule): ShotTimingAssessment {
    const settings = this.settings;
    if (settings.mode === 'TIMESTAMP')
      return { requiresReview: false, reason: 'Use the supplied timestamp by installation policy' };
    const source = shot.timestampSource ?? 'UNKNOWN';
    const uncertainty = settings.clockUncertaintyMilliseconds;
    const delay = source === 'LANE_RECEIPT' ? settings.maximumReceiptDelayMilliseconds : 0;
    const at = shot.firedAt.getTime();
    const context = `source=${source}; clockUncertaintyMs=${uncertainty}; maximumReceiptDelayMs=${delay}`;
    if (source === 'UNKNOWN' || uncertainty === null || delay === null || !Number.isFinite(at)) {
      return { requiresReview: true, reason: `Shot timing needs Jury review: time bounds are unknown (${context})` };
    }
    const earliest = at - delay - uncertainty;
    const latest = at + uncertainty;
    const contained = schedule.exposures.some(
      (window) => earliest >= window.greenAt.getTime() && latest < window.recordingClosesAt.getTime(),
    );
    const overlaps = schedule.exposures.some(
      (window) => latest >= window.greenAt.getTime() && earliest < window.recordingClosesAt.getTime(),
    );
    return {
      requiresReview: !contained && overlaps,
      reason: `${!contained && overlaps ? 'Shot timing needs Jury review: the possible times cross a recording boundary' : 'Shot timing is unambiguous'} (${context}; earliest=${new Date(earliest).toISOString()}; latest=${new Date(latest).toISOString()})`,
    };
  }
}
