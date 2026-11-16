// SPDX-License-Identifier: MIT
import type { ShotTimestampSource } from '@/shared/types/ShotTimestampSource';

/** Decoded target coordinates and reception metadata. */
export interface ShotData {
  /**
   * X coordinate (in mm). null for miss shots.
   */
  x: number | null;

  /**
   * Y coordinate (in mm). null for miss shots.
   */
  y: number | null;

  /**
   * Reception timestamp unless timestampSource explicitly identifies another source.
   */
  timestamp: Date;
  timestampSource?: ShotTimestampSource;

  /**
   * Score reported by the target device (×10 integer)
   */
  score?: number;

  /**
   * Mode notified by the device (SIGHTING=sighting shot, MATCH=match shot).
   * Set by devices that notify mode, such as MT201.
   * When omitted, the Session's mode is used.
   */
  mode?: 'SIGHTING' | 'MATCH';

  /**
   * Raw data (for debugging)
   */
  raw?: Buffer;
}
