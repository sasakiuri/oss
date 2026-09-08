// SPDX-License-Identifier: MIT

/** Provenance of a shot timestamp, independent of clock accuracy and scoring eligibility. */
export type ShotTimestampSource = 'LANE_RECEIPT' | 'DEVICE_REPORTED' | 'UNKNOWN';

export function parseShotTimestampSource(value: unknown): ShotTimestampSource {
  if (value === undefined) return 'UNKNOWN';
  if (value === 'LANE_RECEIPT' || value === 'DEVICE_REPORTED' || value === 'UNKNOWN') return value;
  throw new Error('Shot timestamp source is invalid');
}
