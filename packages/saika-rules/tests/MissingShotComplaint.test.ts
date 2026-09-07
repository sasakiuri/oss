import { describe, expect, it } from 'vitest';

import {
  defineRulePack,
  ISSF_2026_P25,
  ISSF_2026_CFP,
  ISSF_2026_STDP,
  ISSF_2026_RFPM,
  missingShotComplaintGuidance,
  type QualificationTimedTargetRecoveryCapability,
  type RulePack,
} from '../src';

const procedures = (pack: RulePack) =>
  (pack.capabilities.timedTarget!.recovery as QualificationTimedTargetRecoveryCapability).missingShotComplaints!;
describe('25m missing-shot complaint rules', () => {
  it.each([ISSF_2026_P25, ISSF_2026_CFP])('distinguishes precision and rapid notification for $id', (pack) => {
    expect(procedures(pack).map((item) => item.notification)).toEqual(['BEFORE_NEXT_SHOT', 'AFTER_SERIES']);
  });
  it('distinguishes Standard Pistol 150 seconds from the rapid stages without allowing repeat series', () => {
    expect(procedures(ISSF_2026_STDP).map((item) => item.notification)).toEqual([
      'BEFORE_NEXT_SHOT',
      'AFTER_SERIES',
      'AFTER_SERIES',
    ]);
    for (const pack of [ISSF_2026_STDP, ISSF_2026_RFPM])
      for (const procedure of procedures(pack)) {
        expect(procedure.seriesRepeatAllowed).toBe(false);
        expect(missingShotComplaintGuidance(procedure)).toContain('No repeat series');
      }
  });
  it('rejects duplicate or foreign-stage procedures and accepts legacy packs without this optional policy', () => {
    const pack = structuredClone(ISSF_2026_P25);
    const recovery = pack.capabilities.timedTarget!.recovery as QualificationTimedTargetRecoveryCapability;
    expect(() =>
      defineRulePack({
        ...pack,
        capabilities: {
          ...pack.capabilities,
          timedTarget: {
            ...pack.capabilities.timedTarget!,
            recovery: { ...recovery, missingShotComplaints: [procedures(pack)[0]!, procedures(pack)[0]!] },
          },
        },
      }),
    ).toThrow(/unique/);
    expect(() =>
      defineRulePack({
        ...pack,
        capabilities: {
          ...pack.capabilities,
          timedTarget: {
            ...pack.capabilities.timedTarget!,
            recovery: { ...recovery, missingShotComplaints: [{ ...procedures(pack)[0]!, stageId: 'SIGHTING' }] },
          },
        },
      }),
    ).toThrow(/MATCH stage/);
    expect(() =>
      defineRulePack({
        ...pack,
        capabilities: {
          ...pack.capabilities,
          timedTarget: {
            ...pack.capabilities.timedTarget!,
            recovery: { ...recovery, missingShotComplaints: undefined },
          },
        },
      }),
    ).not.toThrow();
  });
});
