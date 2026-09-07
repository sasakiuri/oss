import { describe, expect, it } from 'vitest';

import {
  ISSF_2026_RFPM,
  ISSF_2026_STDP,
  ISSF_2026_P25,
  ISSF_2026_CFP,
  planQualificationMalfunctionFiring,
  type RulePack,
} from '../src';

function context(pack: RulePack, stageId?: string) {
  const stageRule = pack.capabilities.qualificationMalfunction!.stages.find(
    (stage) => !stageId || stage.stageId === stageId,
  )!;
  const stage = pack.capabilities.courseOfFire!.stages.find((item) => item.id === stageRule.stageId)!;
  const programId = stage.series[0]!.timedTargetProgramId;
  const matchProgram = pack.capabilities.timedTarget!.programs.find((program) => program.id === programId)!;
  return { stageRule, matchProgram, seriesShotLimit: 5, recordedShots: 2 };
}

describe('Qualification malfunction firing projection', () => {
  it.each([ISSF_2026_RFPM, ISSF_2026_STDP])('repeats the complete program for $id without scoring it', (pack) => {
    const input = context(pack);
    const plan = planQualificationMalfunctionFiring(input);
    expect(plan.remedy).toBe('REPEAT_FULL_SERIES');
    expect(plan.shotsToFire).toBe(5);
    expect(plan.program).toEqual(input.matchProgram);
    expect(plan.program).not.toBe(input.matchProgram);
  });

  it.each([ISSF_2026_P25, ISSF_2026_CFP])('allocates 48 seconds per remaining precision shot for $id', (pack) => {
    const input = context(pack);
    const plan = planQualificationMalfunctionFiring(input);
    expect(plan.remedy).toBe('COMPLETE_REMAINING_SHOTS');
    expect(plan.shotsToFire).toBe(3);
    expect(plan.program.exposures).toEqual([
      {
        ...input.matchProgram.exposures[0],
        nominalDurationMilliseconds: 144000,
        maximumShots: 3,
      },
    ]);
    expect(input.matchProgram.exposures[0]!.maximumShots).toBe(5);
  });

  it.each([ISSF_2026_P25, ISSF_2026_CFP])('completes $id from the first rapid exposure', (pack) => {
    const stageId = pack.capabilities.qualificationMalfunction!.stages.at(-1)!.stageId;
    const input = context(pack, stageId);
    const plan = planQualificationMalfunctionFiring(input);
    expect(plan.program.exposures).toEqual(input.matchProgram.exposures.slice(0, 3));
    expect(plan.program.betweenExposuresMilliseconds).toBe(input.matchProgram.betweenExposuresMilliseconds);
    expect(plan.program.exposures[0]).toMatchObject({
      signalExtensionMilliseconds: 100,
      recordingAfterTimeMilliseconds: 200,
    });
  });

  it('rejects no-fire, incompatible program and impossible shot-count requests', () => {
    const input = context(ISSF_2026_P25);
    for (const recordedShots of [-1, 1.5, 5, 6])
      expect(() => planQualificationMalfunctionFiring({ ...input, recordedShots })).toThrow();
    expect(() => planQualificationMalfunctionFiring({ ...input, seriesShotLimit: 4 })).toThrow('capacity');
    expect(() =>
      planQualificationMalfunctionFiring({ ...input, matchProgram: { ...input.matchProgram, purpose: 'SIGHTING' } }),
    ).toThrow('MATCH');
    expect(() =>
      planQualificationMalfunctionFiring({
        ...input,
        stageRule: {
          ...input.stageRule,
          allowableTreatment: { type: 'CONTINUE_WITHIN_ORIGINAL_TIME' },
        },
      }),
    ).toThrow('separate firing');
  });
});
