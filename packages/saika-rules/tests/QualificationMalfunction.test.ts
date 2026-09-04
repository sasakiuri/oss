import { describe, expect, it } from 'vitest';

import {
  assessQualificationMalfunctionClaim,
  ISSF_2026_RFPM,
  ISSF_2026_STDP,
  settleQualificationMalfunctionRepeat,
} from '../src';

describe('Qualification malfunction rules', () => {
  it('assesses 25m sighting, stage, match, and exceptional-part claim limits', () => {
    const rapidFire = requiredPolicy(ISSF_2026_RFPM.capabilities.qualificationMalfunction);
    expect(
      assessQualificationMalfunctionClaim(rapidFire, { phase: 'SIGHTING', existingClaimsInScope: 0 }),
    ).toMatchObject({ allowed: false, reason: 'SIGHTING_CLAIM_PROHIBITED' });
    expect(assessQualificationMalfunctionClaim(rapidFire, { phase: 'MATCH', existingClaimsInScope: 0 })).toMatchObject({
      allowed: true,
      maximumInScope: 1,
      reason: 'AVAILABLE',
    });
    expect(assessQualificationMalfunctionClaim(rapidFire, { phase: 'MATCH', existingClaimsInScope: 1 })).toMatchObject({
      allowed: false,
      reason: 'SCOPE_LIMIT_REACHED',
    });

    const standard = requiredPolicy(ISSF_2026_STDP.capabilities.qualificationMalfunction);
    expect(
      assessQualificationMalfunctionClaim(standard, {
        phase: 'MATCH',
        existingClaimsInScope: 1,
        exceptionalPart: { existingClaimsInPart: 1 },
      }),
    ).toMatchObject({ allowed: false, reason: 'PART_LIMIT_REACHED' });
  });

  it('computes the RFPM lowest score on each target', () => {
    const treatment = repeatTreatment(ISSF_2026_RFPM, 'STAGE_1');
    const settlement = settleQualificationMalfunctionRepeat(treatment, [
      {
        row: 'ORIGINAL',
        shots: [shot('o1', 100, 0), shot('o2', 90, 1), shot('o3', 80, 2)],
      },
      {
        row: 'REPEAT',
        shots: [shot('r1', 90, 0), shot('r2', 100, 1), shot('r3', 70, 2), shot('r4', 80, 3), shot('r5', 60, 4)],
      },
    ]);

    expect(settlement.countedShots.map((entry) => entry.shotId)).toEqual(['r1', 'o2', 'r3', 'r4', 'r5']);
    expect(settlement.totalX10).toBe(390);
    expect(settlement.discardedShotIds).toEqual(['o1', 'o3', 'r2']);
    expect(settlement.addedZeros).toEqual([]);
  });

  it('zero-fills the longer RFPM row after a second malfunction', () => {
    const treatment = repeatTreatment(ISSF_2026_RFPM, 'STAGE_1');
    const settlement = settleQualificationMalfunctionRepeat(
      treatment,
      [
        { row: 'ORIGINAL', shots: [shot('o1', 100, 0), shot('o2', 90, 1), shot('o3', 80, 2)] },
        { row: 'REPEAT', shots: [shot('r1', 90, 0), shot('r2', 100, 1)] },
      ],
      'ORIGINAL',
    );

    expect(settlement.addedZeros.map((entry) => entry.targetIndex)).toEqual([3, 4]);
    expect(settlement.countedShots.map((entry) => entry.scoreX10)).toEqual([90, 90, 80, 0, 0]);
    expect(settlement.totalX10).toBe(260);
  });

  it('computes the five lowest STDP values overall, including added zeros', () => {
    const treatment = repeatTreatment(ISSF_2026_STDP, 'STAGE_2_20_SECONDS');
    const settlement = settleQualificationMalfunctionRepeat(
      treatment,
      [
        { row: 'ORIGINAL', shots: [shot('o1', 100), shot('o2', 90), shot('o3', 80), shot('o4', 70)] },
        { row: 'REPEAT', shots: [shot('r1', 90), shot('r2', 80)] },
      ],
      'ORIGINAL',
    );

    expect(settlement.addedZeros).toHaveLength(1);
    expect(settlement.countedShots.map((entry) => entry.scoreX10)).toEqual([0, 70, 80, 80, 90]);
    expect(settlement.totalX10).toBe(320);
  });

  it('does not infer which row receives second-malfunction zeros', () => {
    const treatment = repeatTreatment(ISSF_2026_STDP, 'STAGE_3_10_SECONDS');
    expect(() =>
      settleQualificationMalfunctionRepeat(
        treatment,
        [
          { row: 'ORIGINAL', shots: [shot('o1', 90)] },
          { row: 'REPEAT', shots: [shot('r1', 80), shot('r2', 70)] },
        ],
        'ORIGINAL',
      ),
    ).toThrow('row with the most recorded shots');
  });

  it('rejects duplicate evidence identities across the original and repeat rows', () => {
    const treatment = repeatTreatment(ISSF_2026_STDP, 'STAGE_1_150_SECONDS');
    expect(() =>
      settleQualificationMalfunctionRepeat(treatment, [
        { row: 'ORIGINAL', shots: [shot('same-shot', 90)] },
        {
          row: 'REPEAT',
          shots: [shot('same-shot', 80), shot('r2', 80), shot('r3', 80), shot('r4', 80), shot('r5', 80)],
        },
      ]),
    ).toThrow('unique across both rows');
  });
});

function requiredPolicy<T>(value: T | undefined): T {
  if (!value) throw new Error('Expected Qualification malfunction policy');
  return value;
}

function repeatTreatment(pack: typeof ISSF_2026_RFPM, stageId: string) {
  const policy = requiredPolicy(pack.capabilities.qualificationMalfunction);
  const treatment = policy.stages.find((stage) => stage.stageId === stageId)?.allowableTreatment;
  if (treatment?.type !== 'REPEAT_FULL_SERIES') throw new Error('Expected repeat treatment');
  return treatment;
}

function shot(shotId: string, scoreX10: number, targetIndex?: number) {
  return { shotId, scoreX10, ...(targetIndex === undefined ? {} : { targetIndex }) };
}
