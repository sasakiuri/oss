import { identifyRulePack, ISSF_2026_RFPM, ISSF_2026_AR60_FINAL } from '@sasakiuri/saika-rules';
import { describe, expect, it } from 'vitest';

import { EstComplaintTimingPolicy, type EstComplaintSignalSnapshot } from '@/main/modules/est-complaints';
import { EstComplaintCasePolicy } from '@/main/modules/est-complaints/domain/EstComplaintCasePolicy';
import { EstComplaintSignalContextSchema } from '@/shared/mqtt';

describe('EstComplaintTimingPolicy', () => {
  it.each(['SHOT_VALUE', 'SHOT_NOT_REGISTERED', 'TARGET_FAILURE', 'TARGET_MEDIA_ADVANCE'] as const)(
    'keeps Final %s observations out of the Qualification protest procedure',
    (issue) => {
      const captured = finalSnapshot(issue);
      const timing = new EstComplaintTimingPolicy().assess(captured);
      const plan = new EstComplaintCasePolicy().plan(captured);
      expect(timing.ruleReference).toContain('6.17.1.');
      expect(timing.status).not.toBe('CAPTURED_BEFORE_NEXT_RECORDED_SHOT');
      expect(plan.issueKind).not.toBe('SCORE_VALUE_PROTEST');
      expect(plan.ruleReferences).not.toContain('6.16.5.2');
    },
  );

  it('directs an unregistered Final shot to Final Recovery', () => {
    const plan = new EstComplaintCasePolicy().plan(finalSnapshot('SHOT_NOT_REGISTERED'));
    expect(plan.details).toContain('Final Recovery');
  });

  it('preserves legacy observations for review without assuming their round', () => {
    const value = snapshot();
    const { rules: _rules, ...context } = value.context;
    const legacy = { ...value, context };
    expect(new EstComplaintTimingPolicy().assess(legacy).status).toBe('REQUIRES_OFFICIAL_REVIEW');
    expect(new EstComplaintCasePolicy().plan(legacy).issueKind).toBe('OTHER');
  });
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

  it.each(['BEFORE_NEXT_SHOT', 'AFTER_SERIES'] as const)(
    'uses the captured %s procedure without approving timing or a repeat',
    (notification) => {
      const value = snapshot({ issue: 'SHOT_NOT_REGISTERED' });
      const context = {
        ...value.context,
        missingShotProcedure: { notification, seriesRepeatAllowed: false as const, ruleReference: '8.10.3, 6.10.8' },
      };
      const captured = { ...value, context };
      const result = new EstComplaintTimingPolicy().assess(captured);
      expect(result.status).toBe('SEPARATE_TARGET_PROCEDURE');
      expect(result.ruleReference).toContain('8.10.3');
      expect(result.guidance).toContain(
        notification === 'BEFORE_NEXT_SHOT' ? 'before the next shot' : 'after the series ends',
      );
      expect(result.guidance).toContain('No repeat series');
      const plan = new EstComplaintCasePolicy().plan(captured);
      expect(plan.ruleReferences).not.toContain('6.10.9.3');
      expect(plan.details).toContain('No repeat series');
      expect(new EstComplaintTimingPolicy().assess(value).status).toBe('REQUIRES_OFFICIAL_REVIEW');
    },
  );

  it('does not apply the three-minute shortcut to a target failure', () => {
    const result = new EstComplaintTimingPolicy().assess(snapshot({ issue: 'TARGET_FAILURE' }));

    expect(result).toMatchObject({ advisoryOnly: true, status: 'TARGET_FAILURE_EXCEPTION' });
  });
});

function finalSnapshot(issue: EstComplaintSignalSnapshot['issue']): EstComplaintSignalSnapshot {
  const value = snapshot({ issue });
  const pack = ISSF_2026_AR60_FINAL;
  const context = EstComplaintSignalContextSchema.parse({
    ...value.context,
    rules: {
      round: pack.round,
      identity: identifyRulePack(pack),
      procedures: pack.capabilities.estComplaints!.procedures,
    },
  });
  return { ...value, context };
}

function snapshot(overrides: Partial<EstComplaintSignalSnapshot> = {}): EstComplaintSignalSnapshot {
  return {
    signalId: '11111111-1111-4111-8111-111111111111',
    laneId: '22222222-2222-4222-8222-222222222222',
    firingPointNumber: 7,
    status: 'ACTIVE',
    issue: 'SHOT_VALUE',
    context: {
      rules: { round: 'QUALIFICATION', identity: identifyRulePack(ISSF_2026_RFPM), procedures: [] },
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
