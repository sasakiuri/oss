import { describe, expect, it } from 'vitest';

import { recommendIssfInterruption } from '@/main/modules/range-interruptions/domain/IssfInterruptionPolicy';
import { RangeInterruptionCase } from '@/main/modules/range-interruptions/domain/RangeInterruptionCase';
import { TargetRecoveryAssessment } from '@/main/modules/range-interruptions/domain/TargetRecoveryAssessment';

describe('recommendIssfInterruption', () => {
  it('uses strict more-than-three and more-than-five-minute thresholds', () => {
    expect(recommendIssfInterruption(createCase(), 180)).toMatchObject({
      basis: 'MANUAL_REVIEW',
      suggestedAdditionalSeconds: 0,
      unlimitedSightingShots: false,
    });
    expect(recommendIssfInterruption(createCase(), 181)).toMatchObject({
      basis: 'LOST_TIME',
      suggestedAuthorizedRemainingSeconds: 600,
      unlimitedSightingShots: false,
    });
    expect(recommendIssfInterruption(createCase(), 301)).toMatchObject({
      basis: 'SIGHTING_AND_FIVE_MINUTES',
      suggestedAdditionalSeconds: 300,
      suggestedAuthorizedRemainingSeconds: 900,
      unlimitedSightingShots: true,
    });
  });

  it('adds one minute when an eligible interruption starts in the final five minutes', () => {
    const result = recommendIssfInterruption(createCase({ remainingSecondsAtStart: 240 }), 181);
    expect(result).toMatchObject({
      basis: 'LAST_FIVE_MINUTES',
      suggestedAdditionalSeconds: 60,
      suggestedAuthorizedRemainingSeconds: 300,
    });

    expect(recommendIssfInterruption(createCase({ remainingSecondsAtStart: 240 }), 301)).toMatchObject({
      basis: 'SIGHTING_AND_FIVE_MINUTES',
      suggestedAdditionalSeconds: 360,
      suggestedAuthorizedRemainingSeconds: 600,
      unlimitedSightingShots: true,
    });
  });

  it('keeps target-failure and firing-point-move remedies independent of the stopwatch threshold', () => {
    expect(recommendIssfInterruption(createCase({ cause: 'ALL_TARGET_FAILURE' }), 30)).toMatchObject({
      basis: 'TARGET_FAILURE_RECOVERY',
      suggestedAdditionalSeconds: 300,
      unlimitedSightingShots: true,
      ruleReferences: 'ISSF 6.10.9.1',
    });
    expect(recommendIssfInterruption(createCase({ cause: 'FIRING_POINT_MOVE' }), 30)).toMatchObject({
      basis: 'SIGHTING_AND_FIVE_MINUTES',
      suggestedAdditionalSeconds: 300,
      unlimitedSightingShots: true,
    });
  });

  it('requires the five-minute threshold and a reserve-point move for a single-target remedy', () => {
    const interruption = createCase({ cause: 'SINGLE_TARGET_FAILURE' });
    expect(recommendIssfInterruption(interruption, 120)).toMatchObject({
      basis: 'MANUAL_REVIEW',
      suggestedAdditionalSeconds: 0,
    });

    const repairedInTime = TargetRecoveryAssessment.create({
      caseId: interruption.id,
      repairCompletedAt: new Date('2026-08-31T01:04:59.000Z'),
      movedToReserveFiringPoint: false,
      statement: 'Target repaired on the original firing point',
      officialName: 'Range Officer A',
    });
    expect(recommendIssfInterruption(interruption, 299, repairedInTime)).toMatchObject({
      basis: 'MANUAL_REVIEW',
      suggestedAdditionalSeconds: 0,
      unlimitedSightingShots: false,
    });

    const movedAfterThreshold = TargetRecoveryAssessment.create({
      caseId: interruption.id,
      movedToReserveFiringPoint: true,
      reserveFiringPointNumber: 14,
      statement: 'Target not repaired; athlete moved to reserve firing point 14',
      officialName: 'Range Officer A',
    });
    expect(recommendIssfInterruption(interruption, 330, movedAfterThreshold)).toMatchObject({
      basis: 'TARGET_FAILURE_RECOVERY',
      suggestedAdditionalSeconds: 300,
      unlimitedSightingShots: true,
      ruleReferences: 'ISSF 6.10.9.2',
    });
  });
});

function createCase(
  overrides: Partial<Parameters<typeof RangeInterruptionCase.create>[0]> = {},
): RangeInterruptionCase {
  return RangeInterruptionCase.create({
    cause: 'ATHLETE_NON_FAULT',
    phase: 'MATCH',
    startedAt: new Date('2026-08-31T01:00:00.000Z'),
    remainingSecondsAtStart: 600,
    laneId: '33333333-3333-4333-8333-333333333333',
    summary: 'Target service interruption',
    details: 'The athlete could not continue through no fault of their own.',
    openedBy: 'Range Officer A',
    ...overrides,
  });
}
