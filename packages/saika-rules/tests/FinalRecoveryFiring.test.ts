import { describe, expect, it } from 'vitest';

import {
  ISSF_2026_P25_FINAL,
  ISSF_2026_RFPM_FINAL,
  planFinalRecoveryFiring,
  type FinalTimedTargetRecoveryCapability,
  type RulePack,
} from '../src';

function input(pack: RulePack, recordedShots = 2) {
  const capability = pack.capabilities.timedTarget!;
  return {
    incidentType: 'MALFUNCTION' as const,
    recovery: capability.recovery as FinalTimedTargetRecoveryCapability,
    matchProgram: capability.programs.find((program) => program.purpose === 'MATCH')!,
    seriesShotLimit: 5,
    recordedShots,
  };
}
describe('25m Final recovery acquisition plan', () => {
  it('repeats the entire rapid-fire series and preserves the timing tolerances', () => {
    const source = input(ISSF_2026_RFPM_FINAL);
    const plan = planFinalRecoveryFiring(source);
    expect(plan.shotsToFire).toBe(5);
    expect(plan.remedy).toBe('REPEAT_FULL_SERIES');
    expect(plan.program).toEqual(source.matchProgram);
    expect(plan.program.exposures).not.toBe(source.matchProgram.exposures);
  });
  it('replaces only one unexpected zero for a P25 Final EST complaint', () => {
    const plan = planFinalRecoveryFiring({ ...input(ISSF_2026_P25_FINAL, 2), incidentType: 'EST_FAILURE' });
    expect(plan.shotsToFire).toBe(1);
    expect(plan.program.exposures).toHaveLength(1);
    // An unexpected displayed zero can occupy one of five recorded slots.
    expect(planFinalRecoveryFiring({ ...input(ISSF_2026_P25_FINAL, 5), incidentType: 'EST_FAILURE' }).shotsToFire).toBe(
      1,
    );
    expect(
      planFinalRecoveryFiring({ ...input(ISSF_2026_RFPM_FINAL, 2), incidentType: 'EST_FAILURE' }).shotsToFire,
    ).toBe(5);
  });
  it('completes remaining P25 shots using the first exposures without mutating the course', () => {
    const source = input(ISSF_2026_P25_FINAL);
    const plan = planFinalRecoveryFiring(source);
    expect(plan.shotsToFire).toBe(3);
    expect(plan.program.loadPreparationSeconds).toBe(15);
    expect(planFinalRecoveryFiring({ ...source, incidentType: 'EST_FAILURE' }).program.loadPreparationSeconds).toBe(20);
    expect(plan.program.exposures).toEqual(source.matchProgram.exposures.slice(0, 3));
    expect(source.matchProgram.exposures).toHaveLength(5);
    expect(() => planFinalRecoveryFiring(input(ISSF_2026_P25_FINAL, 5))).toThrow(/remaining/);
    expect(() => planFinalRecoveryFiring({ ...source, seriesShotLimit: 4 })).toThrow(/capacity/);
    expect(() =>
      planFinalRecoveryFiring({ ...source, matchProgram: { ...source.matchProgram, purpose: 'SIGHTING' } }),
    ).toThrow(/MATCH/);
  });
});
