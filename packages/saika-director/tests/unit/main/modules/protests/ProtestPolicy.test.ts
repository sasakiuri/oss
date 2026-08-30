import { describe, expect, it } from 'vitest';

import { ProtestCase } from '@/main/modules/protests/domain/ProtestCase';
import { IssfProtestPolicy, type ProtestRequirements } from '@/main/modules/protests/domain/ProtestPolicy';

function createProtest(
  kind: 'VERBAL' | 'WRITTEN' | 'FINAL_VERBAL' | 'APPEAL',
  overrides: Partial<Parameters<typeof ProtestCase.create>[0]> = {},
): ProtestCase {
  return ProtestCase.create({
    scopeType: 'EVENT',
    scopeId: 'event-1',
    kind,
    ...(kind === 'APPEAL' ? { parentProtestId: 'protest-1' } : {}),
    subject: 'Decision',
    statement: 'Review requested',
    lodgedBy: 'Team Official',
    lodgedAt: new Date('2026-08-01T10:29:59.000Z'),
    triggeringDecisionAt: new Date('2026-08-01T10:00:00.000Z'),
    formReference: kind === 'WRITTEN' || kind === 'APPEAL' ? 'P-1' : null,
    feePaidEuro: kind === 'WRITTEN' ? 50 : kind === 'APPEAL' ? 100 : null,
    openedBy: 'Jury Member',
    ...overrides,
  });
}

describe('IssfProtestPolicy', () => {
  it('uses the ISSF 30-minute appeal deadline independently from the written protest deadline', () => {
    const policy = new IssfProtestPolicy();

    expect(policy.assess(createProtest('APPEAL'))).toMatchObject({
      deadlineAt: new Date('2026-08-01T10:30:00.000Z'),
      withinDeadline: true,
      expectedFeeEuro: 100,
      appealPermitted: false,
      issues: [],
      ruleReferences: 'ISSF 6.16.6',
    });
    expect(policy.assess(createProtest('WRITTEN', { lodgedAt: new Date('2026-08-01T10:20:01.000Z') }))).toMatchObject({
      deadlineAt: new Date('2026-08-01T10:20:00.000Z'),
      withinDeadline: false,
      issues: ['The filing is outside 20 minutes; record the accepted exception or reject it'],
    });
  });

  it('accepts an omitted fee for no-fee verbal procedures', () => {
    const assessment = new IssfProtestPolicy().assess(
      createProtest('FINAL_VERBAL', { triggeringDecisionAt: null, feePaidEuro: null }),
    );

    expect(assessment).toMatchObject({
      deadlineAt: null,
      withinDeadline: null,
      expectedFeeEuro: 0,
      formRequired: false,
      issues: [],
    });
  });

  it('allows another competition profile to replace deadlines and fees without changing the policy', () => {
    const localRequirements: ProtestRequirements = {
      VERBAL: {
        filingWindowMinutes: null,
        expectedFeeEuro: 0,
        formRequired: false,
        appealPermitted: true,
        ruleReferences: 'Local 1',
      },
      WRITTEN: {
        filingWindowMinutes: 15,
        expectedFeeEuro: 0,
        formRequired: false,
        appealPermitted: false,
        ruleReferences: 'Local 2',
      },
      FINAL_VERBAL: {
        filingWindowMinutes: null,
        expectedFeeEuro: 0,
        formRequired: false,
        appealPermitted: false,
        ruleReferences: 'Local 3',
      },
      APPEAL: {
        filingWindowMinutes: 15,
        expectedFeeEuro: 0,
        formRequired: false,
        appealPermitted: false,
        ruleReferences: 'Local 4',
      },
    };

    const assessment = new IssfProtestPolicy(localRequirements).assess(
      createProtest('WRITTEN', { feePaidEuro: null, formReference: null }),
    );

    expect(assessment).toMatchObject({
      deadlineAt: new Date('2026-08-01T10:15:00.000Z'),
      expectedFeeEuro: 0,
      formRequired: false,
      appealPermitted: false,
      ruleReferences: 'Local 2',
    });
  });
});
