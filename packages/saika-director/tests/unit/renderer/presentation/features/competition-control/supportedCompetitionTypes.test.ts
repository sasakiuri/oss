import { describe, expect, it } from 'vitest';

import {
  asSupportedLaneCompetitionType,
  getLaneCompetitionTiming,
  LANE_COMPETITION_TYPES,
} from '@/renderer/presentation/features/competition-control/supportedCompetitionTypes';
import {
  RULE_PACK_CALL_TO_LINE_REQUIREMENT_ID,
  RULE_PACK_SETUP_REQUIREMENT_ID,
  RULE_PACK_SIGHTING_TARGET_VISIBILITY_REQUIREMENT_ID,
  RULE_PACK_TARGET_RESET_REQUIREMENT_ID,
} from '@/shared/competitionTypes';

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
});
