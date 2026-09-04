import { describe, expect, it } from 'vitest';

import { EstComplaintTimingPolicy, type EstComplaintSignalSnapshot } from '@/main/modules/est-complaints';

describe('EstComplaintTimingPolicy', () => {
  it('reports captured firing evidence as an advisory instead of accepting a protest', () => {
    const result = new EstComplaintTimingPolicy().assess(snapshot());

    expect(result).toEqual({
      advisoryOnly: true,
      status: 'CAPTURED_BEFORE_NEXT_RECORDED_SHOT',
      elapsedMilliseconds: 60_000,
      ruleReference: 'ISSF 6.16.5.2',
      guidance: expect.stringContaining('Confirm the firing sequence'),
    });
    expect(result).not.toHaveProperty('accepted');
    expect(result).not.toHaveProperty('valid');
  });

  it('does not apply the three-minute shortcut to a target failure', () => {
    const result = new EstComplaintTimingPolicy().assess(snapshot({ issue: 'TARGET_FAILURE' }));

    expect(result).toMatchObject({ advisoryOnly: true, status: 'TARGET_FAILURE_EXCEPTION' });
  });
});

function snapshot(overrides: Partial<EstComplaintSignalSnapshot> = {}): EstComplaintSignalSnapshot {
  return {
    signalId: '11111111-1111-4111-8111-111111111111',
    laneId: '22222222-2222-4222-8222-222222222222',
    firingPointNumber: 7,
    status: 'ACTIVE',
    issue: 'SHOT_VALUE',
    context: {
      competitionId: '33333333-3333-4333-8333-333333333333',
      sessionId: '44444444-4444-4444-8444-444444444444',
      participantId: 'athlete-a',
      participantName: 'Athlete A',
      startNumber: '101',
      phase: 'MATCH',
      stageIndex: 1,
      seriesIndex: 2,
      seriesShotLimit: 5,
      recordedShots: 3,
      timedTargetProgramId: 'RFPM_PROGRAM',
      exposureIndex: 2,
      lastShot: {
        shotId: '55555555-5555-4555-8555-555555555555',
        shotNumberInSeries: 3,
        firedAt: '2026-09-04T00:58:59.000Z',
        receivedAt: '2026-09-04T00:59:00.000Z',
      },
    },
    message: 'Displayed value appears incorrect.',
    signalledAt: new Date('2026-09-04T01:00:00.000Z'),
    ...overrides,
  };
}
