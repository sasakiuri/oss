// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { EstComplaintSignalPayloadSchema } from '../src/EstComplaintSignal';

describe('EstComplaintSignalPayloadSchema', () => {
  it('accepts an empty retained cleared state', () => {
    expect(
      EstComplaintSignalPayloadSchema.parse({
        schemaVersion: 1,
        laneId: '11111111-1111-4111-8111-111111111111',
        status: 'CLEARED',
        signalId: null,
        issue: null,
        context: null,
        message: null,
        signalledAt: null,
        clearedAt: null,
        clearedBy: null,
        publishedAt: '2026-09-04T00:00:00.000Z',
      }).status,
    ).toBe('CLEARED');
  });

  it('rejects an active state without an issue or context', () => {
    expect(
      EstComplaintSignalPayloadSchema.safeParse({
        schemaVersion: 1,
        laneId: '11111111-1111-4111-8111-111111111111',
        status: 'ACTIVE',
        signalId: '22222222-2222-4222-8222-222222222222',
        issue: null,
        context: null,
        message: null,
        signalledAt: '2026-09-04T00:00:00.000Z',
        clearedAt: null,
        clearedBy: null,
        publishedAt: '2026-09-04T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('EstComplaintSignalPayloadSchema active observation snapshot', () => {
  const activeSignal = {
    schemaVersion: 1,
    laneId: '11111111-1111-4111-8111-111111111111',
    status: 'ACTIVE',
    signalId: '22222222-2222-4222-8222-222222222222',
    issue: 'SHOT_VALUE',
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
      lastShot: {
        shotId: '66666666-6666-4666-8666-666666666666',
        shotNumberInSeries: 3,
        firedAt: '2026-09-04T00:00:00.000Z',
        receivedAt: '2026-09-04T00:00:00.100Z',
      },
    },
    message: null,
    signalledAt: '2026-09-04T00:00:01.000Z',
    clearedAt: null,
    clearedBy: null,
    publishedAt: '2026-09-04T00:00:02.000Z',
  };

  it('accepts a complete Lane observation snapshot', () => {
    expect(EstComplaintSignalPayloadSchema.safeParse(activeSignal).success).toBe(true);
  });

  it('rejects a partial latest-shot snapshot', () => {
    expect(
      EstComplaintSignalPayloadSchema.safeParse({
        ...activeSignal,
        context: { ...activeSignal.context, lastShot: { shotId: activeSignal.context.lastShot.shotId } },
      }).success,
    ).toBe(false);
  });
});
