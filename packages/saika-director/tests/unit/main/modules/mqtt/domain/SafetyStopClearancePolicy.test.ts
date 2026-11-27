import { describe, expect, it } from 'vitest';

import { SafetyStopClearancePolicy } from '@/main/modules/mqtt';
import type { ClearSafetyStopPayload } from '@/shared/ipc/contracts';

const stopId = '11111111-1111-4111-8111-111111111111';
const laneId = '22222222-2222-4222-8222-222222222222';

describe('SafetyStopClearancePolicy', () => {
  it('accepts a physical check tied to the current stopped Lane and assigned athlete', () => {
    expect(() => new SafetyStopClearancePolicy().validate(request(), snapshot())).not.toThrow();
    expect(() =>
      new SafetyStopClearancePolicy().validate(
        request({ athleteConfirmation: { status: 'NOT_APPLICABLE', reason: 'Athlete remained at firing point' } }),
        snapshot(),
      ),
    ).not.toThrow();
  });

  it('rejects stale athlete identity and a Lane from another safety operation', () => {
    expect(() =>
      new SafetyStopClearancePolicy().validate(request({ participantName: 'Previous Athlete' }), snapshot()),
    ).toThrow('athlete assignment changed');
    expect(() =>
      new SafetyStopClearancePolicy().validate(request(), snapshot('33333333-3333-4333-8333-333333333333')),
    ).toThrow('is not stopped by safety operation');
  });

  it('requires an explicit not-applicable reason when no athlete is assigned', () => {
    const noAthlete = snapshot(stopId, false);

    expect(() => new SafetyStopClearancePolicy().validate(request(), noAthlete)).toThrow('has no assigned athlete');
    expect(() =>
      new SafetyStopClearancePolicy().validate(
        request({
          participantId: null,
          participantName: null,
          athleteConfirmation: { status: 'NOT_APPLICABLE', reason: 'No athlete assigned at verification' },
        }),
        noAthlete,
      ),
    ).not.toThrow();
  });
});

function request(
  clearanceOverrides: Partial<ClearSafetyStopPayload['laneClearances'][number]> = {},
): ClearSafetyStopPayload {
  return {
    safetyStopId: stopId,
    clearanceReason: 'Range inspected and declared safe',
    officialName: 'CRO A',
    laneClearances: [
      {
        laneId,
        participantId: 'athlete-a',
        participantName: 'Athlete A',
        athleteConfirmation: { status: 'CONFIRMED', confirmedBy: 'Athlete A' },
        firearmCondition: 'UNLOADED_SAFETY_FLAG_INSERTED',
        personnelClear: true,
        verifiedBy: 'RO A',
        ...clearanceOverrides,
      },
    ],
  };
}

function snapshot(safetyStopId = stopId, assigned = true) {
  return {
    lanes: [
      {
        laneId,
        safetyState: { status: 'STOPPED' as const, safetyStopId },
        assignment: assigned ? { athlete: { id: 'athlete-a', name: 'Athlete A' } } : null,
      },
    ],
  };
}
