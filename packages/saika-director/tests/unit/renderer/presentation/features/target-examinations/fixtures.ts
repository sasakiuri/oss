import type { TargetExaminationCaseDto } from '@/shared/ipc/contracts';

export const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
export const EVENT_ID = '22222222-2222-4222-8222-222222222222';
export const CASE_ID = '33333333-3333-4333-8333-333333333333';
export const LANE_ID = '44444444-4444-4444-8444-444444444444';

export function caseFixture(overrides: Partial<TargetExaminationCaseDto> = {}): TargetExaminationCaseDto {
  return {
    id: CASE_ID,
    issueKind: 'NO_SHOT_INDICATION',
    occurredAt: '2026-08-31T01:00:00.000Z',
    laneId: LANE_ID,
    firingPointNumber: 12,
    relayNumber: 1,
    athleteName: 'Alex Athlete',
    shotId: null,
    summary: 'Expected shot was not shown',
    details: 'The monitor remained unchanged after the athlete reported firing.',
    ruleReferences: 'ISSF 6.10.5, 6.10.8',
    openedBy: 'RTS Officer A',
    createdAt: '2026-08-31T01:00:01.000Z',
    scopes: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        caseId: CASE_ID,
        scopeType: 'COMPETITION',
        scopeId: COMPETITION_ID,
        linkedBy: 'RTS Officer A',
        note: 'Linked when opened',
        linkedAt: '2026-08-31T01:00:01.000Z',
      },
    ],
    evidence: [],
    entries: [],
    status: 'OPEN',
    evidenceHoldActive: true,
    workflow: {
      policyId: 'ISSF-2026-TARGET-EXAMINATION-V1',
      advisoryOnly: true,
      readyForJuryDecision: false,
      steps: [
        {
          id: 'est-log-print',
          label: 'Secure the EST LOG print',
          ruleReference: 'ISSF 6.10.8.1.g',
          status: 'MISSING',
          guidance: 'Do not clear the LOG until the RTS Jury authorizes release of the evidence hold.',
        },
      ],
    },
    ...overrides,
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
