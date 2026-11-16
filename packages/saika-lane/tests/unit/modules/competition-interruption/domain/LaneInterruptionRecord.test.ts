// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import {
  LaneInterruptionRecord,
  type LaneInterruptionRecordProps,
} from '@/main/modules/competition-interruption/domain/LaneInterruptionRecord';

const props: LaneInterruptionRecordProps = {
  competitionId: 'competition-1',
  interruptionId: 'interruption-1',
  status: 'PAUSED',
  pausedAt: new Date('2026-01-15T10:00:00Z'),
  capturedAt: new Date('2026-01-15T10:00:00Z'),
  capturedRemainingSeconds: 240,
  capturedTotalSeconds: 600,
};

describe('LaneInterruptionRecord validation messages', () => {
  it.each(['capturedRemainingSeconds', 'capturedTotalSeconds', 'authorizedRemainingSeconds'] as const)(
    'reports a negative or fractional %s as "must be non-negative"',
    (field) => {
      for (const value of [-1, 1.5]) {
        expect(() => LaneInterruptionRecord.create({ ...props, [field]: value })).toThrow(
          new Error(`${field} must be non-negative`),
        );
      }
    },
  );

  it('reports an invalid time as "must be valid"', () => {
    expect(() => LaneInterruptionRecord.create({ ...props, pausedAt: new Date(Number.NaN) })).toThrow(
      new Error('pausedAt must be valid'),
    );
  });

  it('reports a blank id as "is required"', () => {
    expect(() => LaneInterruptionRecord.create({ ...props, interruptionId: ' ' })).toThrow(
      new Error('interruptionId is required'),
    );
  });
});
