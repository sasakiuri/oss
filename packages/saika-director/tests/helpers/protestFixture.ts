import type { ProtestCaseDto } from '@/shared/ipc/contracts';

export const PROTEST_ID = '11111111-1111-4111-8111-111111111111';
export const APPEAL_ID = '22222222-2222-4222-8222-222222222222';

export function protestFixture(overrides: Partial<ProtestCaseDto> = {}): ProtestCaseDto {
  return {
    id: PROTEST_ID,
    scopeType: 'EVENT',
    scopeId: 'event-a',
    kind: 'WRITTEN',
    parentProtestId: null,
    subject: 'Interruption decision',
    statement: 'A review of the interruption is requested.',
    lodgedBy: 'Team official',
    lodgedAt: '2026-09-08T00:10:00.000Z',
    triggeringDecisionAt: '2026-09-08T00:00:00.000Z',
    formReference: 'P-42',
    feePaidEuro: 50,
    lateAcceptanceReason: null,
    openedBy: 'Range official',
    createdAt: '2026-09-08T00:11:00.000Z',
    status: 'OPEN',
    compliance: {
      deadlineAt: '2026-09-08T00:20:00.000Z',
      withinDeadline: true,
      expectedFeeEuro: 50,
      formRequired: true,
      appealPermitted: true,
      issues: [],
      ruleReferences: 'ISSF 6.16.3–6.16.5',
    },
    entries: [],
    ...overrides,
  };
}
