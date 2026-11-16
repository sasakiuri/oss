import { describe, expect, it } from 'vitest';

import { ISSF_2026_RULE_PACKS, JRSF_2026_RULE_PACKS } from '@sasakiuri/saika-rules';

import {
  asSupportedLaneCompetitionType,
  getLaneCompetitionDefinition,
  getLaneCompetitionTiming,
  LANE_COMPETITION_TYPES,
} from '@/renderer/presentation/features/competition-control/supportedCompetitionTypes';
import {
  RULE_PACK_CALL_TO_LINE_REQUIREMENT_ID,
  RULE_PACK_SETUP_REQUIREMENT_ID,
  RULE_PACK_SIGHTING_TARGET_VISIBILITY_REQUIREMENT_ID,
  RULE_PACK_TARGET_RESET_REQUIREMENT_ID,
} from '@/shared/competitionTypes';
import { BP60 } from '@/shared/competitionTypes/definitions/BP60';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';
import { competitionTypeFromRulePack } from '@/shared/competitionTypes/fromRulePack';

describe('supported Lane competition types', () => {
  it('allows the Rule Pack-backed 10m air qualification events', () => {
    expect(LANE_COMPETITION_TYPES).toContain('AR60');
    expect(LANE_COMPETITION_TYPES).toContain('AP60');
    expect(asSupportedLaneCompetitionType('AR60')).toBe('AR60');
  });

  it('allows Rule Pack-backed 10m individual finals', () => {
    expect(asSupportedLaneCompetitionType('AR60_FINAL')).toBe('AR60_FINAL');
    expect(asSupportedLaneCompetitionType('AP60_FINAL')).toBe('AP60_FINAL');
    expect(getLaneCompetitionTiming('AR60_FINAL')).toEqual({
      preparationAndSightingSeconds: 300,
      matchSeconds: 250,
      phaseStartRequirements: {
        MATCH: [
          expect.objectContaining({
            id: RULE_PACK_TARGET_RESET_REQUIREMENT_ID,
            timing: { durationSeconds: 60, qualifier: 'APPROXIMATE' },
          }),
        ],
      },
    });
  });

  it('allows Rule Pack-backed Mixed Team Qualification and Finals', () => {
    expect(LANE_COMPETITION_TYPES).toEqual(
      expect.arrayContaining(['ARMIX30', 'APMIX30', 'ARMIX_FINAL', 'APMIX_FINAL']),
    );
    expect(getLaneCompetitionTiming('ARMIX30')).toMatchObject({
      preparationAndSightingSeconds: 900,
      matchSeconds: 2400,
    });
    expect(getLaneCompetitionTiming('ARMIX_FINAL')).toMatchObject({
      preparationAndSightingSeconds: 300,
      matchSeconds: 250,
    });
  });

  it('allows independently timed 25m individual Finals', () => {
    expect(LANE_COMPETITION_TYPES).toEqual(expect.arrayContaining(['RFPM_FINAL', 'P25_FINAL']));
    expect(getLaneCompetitionTiming('RFPM_FINAL')).toEqual({
      preparationAndSightingSeconds: 60,
      matchSeconds: null,
      phaseStartRequirements: {
        SIGHTING: [expect.objectContaining({ id: RULE_PACK_CALL_TO_LINE_REQUIREMENT_ID })],
      },
    });
    expect(getLaneCompetitionTiming('P25_FINAL')).toMatchObject({
      preparationAndSightingSeconds: 120,
      matchSeconds: null,
    });
  });

  it('allows explicit 50m Elimination, outdoor, indoor, prone, and Final operations', () => {
    expect(LANE_COMPETITION_TYPES).toEqual(
      expect.arrayContaining(['R3P60_ELIMINATION', 'R3P60', 'R3P60_INDOOR', 'RPR60_ELIMINATION', 'RPR60', 'R3P_FINAL']),
    );
    expect(getLaneCompetitionTiming('R3P60_ELIMINATION')).toMatchObject({ matchSeconds: 6300 });
    expect(getLaneCompetitionTiming('R3P60')).toMatchObject({
      preparationAndSightingSeconds: 900,
      matchSeconds: 6300,
    });
    expect(getLaneCompetitionTiming('R3P60_INDOOR')).toMatchObject({ matchSeconds: 5400 });
    expect(getLaneCompetitionTiming('RPR60')).toMatchObject({ matchSeconds: 3000 });
    expect(getLaneCompetitionTiming('RPR60_ELIMINATION')).toMatchObject({ matchSeconds: 3000 });
    expect(getLaneCompetitionTiming('R3P_FINAL')).toMatchObject({
      preparationAndSightingSeconds: 300,
      matchSeconds: 1320,
    });
  });

  it('takes command durations from each competition definition', () => {
    expect(getLaneCompetitionTiming('BR60S')).toEqual({
      preparationAndSightingSeconds: 600,
      matchSeconds: 2700,
    });
    expect(getLaneCompetitionTiming('AR60')).toEqual({
      preparationAndSightingSeconds: 900,
      matchSeconds: 4500,
      phaseStartRequirements: {
        SIGHTING: [
          expect.objectContaining({
            id: RULE_PACK_CALL_TO_LINE_REQUIREMENT_ID,
            timing: { durationSeconds: 1500, qualifier: 'MINIMUM' },
          }),
          expect.objectContaining({
            id: RULE_PACK_SIGHTING_TARGET_VISIBILITY_REQUIREMENT_ID,
            timing: { durationSeconds: 600, qualifier: 'MINIMUM' },
          }),
          expect.objectContaining({
            id: RULE_PACK_SETUP_REQUIREMENT_ID,
            timing: { durationSeconds: 600, qualifier: 'REQUIRED' },
          }),
        ],
        MATCH: [
          expect.objectContaining({
            id: RULE_PACK_TARGET_RESET_REQUIREMENT_ID,
            timing: { durationSeconds: 30, qualifier: 'APPROXIMATE' },
          }),
        ],
      },
    });
  });

  it('keeps the Beam qualifications on their Director definitions', () => {
    const packs = [...ISSF_2026_RULE_PACKS, ...JRSF_2026_RULE_PACKS];
    expect(packs.filter((pack) => pack.eventCode === 'BR60S' || pack.eventCode === 'BP60')).toEqual([]);
    expect(getLaneCompetitionDefinition('BR60S')).toBe(BR60S);
    expect(getLaneCompetitionDefinition('BP60')).toBe(BP60);
  });

  it.each(LANE_COMPETITION_TYPES.filter((type) => type !== 'BR60S' && type !== 'BP60'))(
    'defines %s by the one ISSF or JRSF Rule Pack with that event code',
    (competitionType) => {
      const matching = [...ISSF_2026_RULE_PACKS, ...JRSF_2026_RULE_PACKS].filter(
        (pack) => pack.eventCode === competitionType,
      );
      expect(matching).toHaveLength(1);
      expect(getLaneCompetitionDefinition(competitionType)).toEqual(competitionTypeFromRulePack(matching[0]!));
    },
  );
});
