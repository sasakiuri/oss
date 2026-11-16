// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { QualificationMalfunctionSignalPayloadSchema } from '../src/QualificationMalfunctionSignal';

const emptyState = {
  schemaVersion: 1,
  laneId: '11111111-1111-4111-8111-111111111111',
  status: 'CLEARED',
  signalId: null,
  context: null,
  message: null,
  signalledAt: null,
  clearedAt: null,
  clearedBy: null,
  publishedAt: '2026-09-04T00:00:00.000Z',
} as const;

describe('QualificationMalfunctionSignalPayloadSchema', () => {
  it('accepts the initial empty retained state', () => {
    expect(QualificationMalfunctionSignalPayloadSchema.parse(emptyState)).toEqual(emptyState);
  });

  it('rejects active state without an immutable context snapshot', () => {
    expect(
      QualificationMalfunctionSignalPayloadSchema.safeParse({
        ...emptyState,
        status: 'ACTIVE',
        signalId: '22222222-2222-4222-8222-222222222222',
        signalledAt: '2026-09-04T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('QualificationMalfunctionSignalPayloadSchema active observation snapshot', () => {
  const activeSignal = {
    schemaVersion: 1,
    laneId: '11111111-1111-4111-8111-111111111111',
    status: 'ACTIVE',
    signalId: '22222222-2222-4222-8222-222222222222',
    context: {
      competitionId: '33333333-3333-4333-8333-333333333333',
      sessionId: '44444444-4444-4444-8444-444444444444',
      participantId: '55555555-5555-4555-8555-555555555555',
      participantName: 'Test Athlete',
      startNumber: '12',
      phase: 'MATCH',
      stageIndex: 1,
      seriesIndex: 2,
      seriesShotLimit: 5,
      recordedShots: 3,
      timedTargetProgramId: 'rapid-4s',
      exposureIndex: 2,
    },
    message: null,
    signalledAt: '2026-09-04T00:00:00.000Z',
    clearedAt: null,
    clearedBy: null,
    publishedAt: '2026-09-04T00:00:01.000Z',
  };

  it('accepts a complete Lane observation snapshot', () => {
    expect(QualificationMalfunctionSignalPayloadSchema.safeParse(activeSignal).success).toBe(true);
  });

  it('rejects a declaration whose shot count exceeds its captured series limit', () => {
    expect(
      QualificationMalfunctionSignalPayloadSchema.safeParse({
        ...activeSignal,
        context: { ...activeSignal.context, recordedShots: 6 },
      }).success,
    ).toBe(false);
  });
});
