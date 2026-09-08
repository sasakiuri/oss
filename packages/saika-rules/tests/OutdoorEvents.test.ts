import { describe, expect, it } from 'vitest';

import {
  ISSF_2026_300M_RIFLE_RULE_PACKS,
  ISSF_2026_50M_PISTOL_RULE_PACKS,
  ISSF_2026_FP60,
  ISSF_2026_FP60_ELIMINATION,
  ISSF_2026_R300_3P60,
  ISSF_2026_R300_PR60,
  ISSF_2026_R300_STD60,
  RulePackRegistry,
} from '../src';

describe('300m Rifle and 50m Pistol EST events', () => {
  it.each([
    [ISSF_2026_R300_3P60, 6300],
    [ISSF_2026_R300_PR60, 3600],
    [ISSF_2026_R300_STD60, 6300],
    [ISSF_2026_FP60, 5400],
  ] as const)('uses the prescribed EST time for $0.eventCode', (pack, seconds) => {
    const [sighting, match] = pack.capabilities.courseOfFire.stages;
    expect(sighting).toMatchObject({ series: [{ shots: 0 }], timer: { durationSeconds: 900 } });
    expect(match?.timer).toEqual({ mode: 'stage', durationSeconds: seconds });
    expect(match?.series.reduce((total, series) => total + series.shots, 0)).toBe(60);
    expect(pack.capabilities.scoring.mode).toBe('RING');
    expect(pack.capabilities.ranking.strategy).toBe('ISSF_6_15_1_FULL_RING');
    expect(pack.capabilities.timedTarget).toBeUndefined();
    expect(pack.capabilities.commands?.finalScript).toBeUndefined();
  });

  it.each([ISSF_2026_R300_3P60, ISSF_2026_R300_STD60])(
    'allows athlete-controlled sighting only at the next position for $eventCode',
    (pack) => {
      const series = pack.capabilities.courseOfFire.stages[1]!.series;
      expect(series.map((item) => item.position)).toEqual([
        'KNEELING',
        'KNEELING',
        'PRONE',
        'PRONE',
        'STANDING',
        'STANDING',
      ]);
      expect(series.map((item) => item.targetModeControl)).toEqual([
        undefined,
        undefined,
        'ATHLETE',
        undefined,
        'ATHLETE',
        undefined,
      ]);
    },
  );

  it('retains the complete course and its scoring evidence requirements for Elimination', () => {
    const packs = [...ISSF_2026_300M_RIFLE_RULE_PACKS, ...ISSF_2026_50M_PISTOL_RULE_PACKS];
    const registry = new RulePackRegistry(packs);
    expect(registry.getAll()).toHaveLength(8);
    expect(packs.some((pack) => pack.round === 'FINAL')).toBe(false);
    for (const pack of packs.filter((item) => item.round === 'ELIMINATION')) {
      const qualification = packs.find((item) => `${item.eventCode}_ELIMINATION` === pack.eventCode)!;
      expect(pack.capabilities.courseOfFire).toEqual(qualification.capabilities.courseOfFire);
      expect(pack.capabilities.outdoorEliminationPlanning?.quotaMethod).toBe('PROPORTIONAL_RELAY_STARTS');
      expect(pack.capabilities.publication?.scoreProtestWindowSeconds).toBe(600);
      expect(pack.capabilities.verification?.topIndividualResults).toBe(10);
    }
  });

  it('does not impose the 50m Rifle minimum qualifying field on 50m Pistol', () => {
    expect(
      ISSF_2026_FP60_ELIMINATION.capabilities.outdoorEliminationPlanning?.minimumQualificationAthletes,
    ).toBeUndefined();
    expect(ISSF_2026_FP60.capabilities.target.scoringGaugeProfileId).toBe('ISSF_SMALLBORE_5_60_2026');
    expect(ISSF_2026_R300_3P60.capabilities.target.scoringGaugeProfileId).toBe('ISSF_RIFLE_8_00_2026');
  });
});
