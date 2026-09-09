import type { RangeInterruptionCaseDto } from '@/shared/ipc/contracts';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const INTERRUPTION_ID = '33333333-3333-4333-8333-333333333333';
const LANE_ID = '44444444-4444-4444-8444-444444444444';

export function fixture(overrides: Partial<RangeInterruptionCaseDto> = {}): RangeInterruptionCaseDto {
  return {
    id: INTERRUPTION_ID,
    cause: 'ATHLETE_NON_FAULT',
    phase: 'MATCH',
    startedAt: '2026-08-31T01:00:00.000Z',
    remainingSecondsAtStart: 240,
    laneId: LANE_ID,
    firingPointNumber: 12,
    athleteName: 'Alex Athlete',
    summary: 'Athlete stopped through no fault',
    details: 'The target carrier blocked the athlete.',
    openedBy: 'Range Officer A',
    createdAt: '2026-08-31T01:00:01.000Z',
    scopes: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        caseId: INTERRUPTION_ID,
        scopeType: 'COMPETITION',
        scopeId: COMPETITION_ID,
        linkedBy: 'Range Officer A',
        note: 'Linked when opened',
        linkedAt: '2026-08-31T01:00:01.000Z',
      },
    ],
    entries: [],
    targetRecoveryAssessments: [],
    qualificationTimedTargetContext: null,
    qualificationTimedTargetRecoveryDecisions: [],
    qualificationRecoveryExecutions: [],
    qualificationRecoverySettlements: [],
    status: 'OPEN',
    dataHoldActive: true,
    recommendation: null,
    ...overrides,
  };
}
