import { describe, expect, it } from 'vitest';
import { ISSF_2026_AP60, ISSF_2026_ARMIX30, ISSF_2026_AR60, ISSF_2026_AR60_FINAL } from '@sasakiuri/saika-rules';

import {
  competitionTypeFromRulePack,
  DEFAULT_FIRING_WINDOW_CLOCK_TOLERANCE_MILLISECONDS,
  RULE_PACK_CALL_TO_LINE_REQUIREMENT_ID,
  RULE_PACK_SIGHTING_TARGET_VISIBILITY_REQUIREMENT_ID,
  RULE_PACK_SETUP_REQUIREMENT_ID,
  RULE_PACK_TARGET_RESET_REQUIREMENT_ID,
} from '@/shared/competitionTypes';

describe('competitionTypeFromRulePack', () => {
  it('maps the ISSF 10m qualification course and Lane protocol metadata', () => {
    const rifle = competitionTypeFromRulePack(ISSF_2026_AR60);
    const pistol = competitionTypeFromRulePack(ISSF_2026_AP60);

    expect(rifle).toMatchObject({
      id: 'AR60',
      rulePackId: 'ISSF:2026:AR60:QUALIFICATION',
      scoring: { minScore: 0, maxScore: 109, precision: 1 },
      laneProtocol: { discipline: 'AIR_RIFLE_10M', acc: 'DECIMAL' },
      resultFormat: { totalShots: 60, totalSeries: 6, tieBreakPolicy: 'ISSF_DECIMAL_RIFLE' },
      resultVerification: { topIndividualResults: 10, topTeamResults: 0 },
      timerAnnouncements: {
        preparationWarningsAtRemainingSeconds: [30],
        matchWarningsAtRemainingSeconds: [600, 300],
      },
      phaseStartRequirements: {
        SIGHTING: [
          {
            id: RULE_PACK_CALL_TO_LINE_REQUIREMENT_ID,
            description: expect.stringMatching(/called to the line.*published START/i),
            timing: { durationSeconds: 1500, qualifier: 'MINIMUM' },
          },
          {
            id: RULE_PACK_SIGHTING_TARGET_VISIBILITY_REQUIREMENT_ID,
            description: expect.stringMatching(/sighting targets.*visible/i),
            timing: { durationSeconds: 600, qualifier: 'MINIMUM' },
          },
          {
            id: RULE_PACK_SETUP_REQUIREMENT_ID,
            description: expect.stringMatching(/setup period.*pre-competition checks/i),
            timing: { durationSeconds: 600, qualifier: 'REQUIRED' },
          },
        ],
        MATCH: [
          {
            id: RULE_PACK_TARGET_RESET_REQUIREMENT_ID,
            description: expect.stringMatching(/all targets are reset/i),
            timing: { durationSeconds: 30, qualifier: 'APPROXIMATE' },
          },
        ],
      },
      firingWindowDetection: {
        timestampSource: 'FIRED_AT',
        clockToleranceMilliseconds: DEFAULT_FIRING_WINDOW_CLOCK_TOLERANCE_MILLISECONDS,
        rules: [
          expect.objectContaining({
            id: 'issf.6.11.1.1.h.before-preparation-start',
            kind: 'BEFORE_PREPARATION_AND_SIGHTING_START',
            ruleReference: '6.11.1.1(h)',
          }),
          expect.objectContaining({
            id: 'issf.6.11.1.1.k.between-phases',
            kind: 'BETWEEN_PREPARATION_AND_SIGHTING_STOP_AND_MATCH_START',
            ruleReference: '6.11.1.1(k)',
          }),
          expect.objectContaining({
            id: 'issf.6.11.1.3.after-match-stop',
            kind: 'AFTER_MATCH_STOP',
            ruleReference: '6.11.1.3',
          }),
        ],
      },
    });
    expect(rifle.config.stages.map((stage) => stage.timer)).toEqual([
      { mode: 'stage', durationSec: 900 },
      { mode: 'stage', durationSec: 4500 },
    ]);
    expect(pistol.laneProtocol).toEqual({ discipline: 'AIR_PISTOL_10M', acc: 'RING' });
    expect(pistol.resultFormat.tieBreakPolicy).toBe('ISSF_FULL_RING');
  });

  it('adapts Mixed Team Qualification firing-window rules without changing the detector', () => {
    const definition = competitionTypeFromRulePack(ISSF_2026_ARMIX30);

    expect(definition.firingWindowDetection?.rules).toEqual([
      expect.objectContaining({
        id: 'issf.6.18.2.4.d.before-preparation-start',
        ruleReference: '6.18.2.4(d)',
      }),
      expect.objectContaining({
        id: 'issf.6.18.2.4.g.between-phases',
        ruleReference: '6.18.2.4(g)',
      }),
      expect.objectContaining({ id: 'issf.6.11.1.3.after-match-stop' }),
    ]);
  });

  it('maps the 10m Final checkpoints without changing the shared Rule Pack', () => {
    const definition = competitionTypeFromRulePack(ISSF_2026_AR60_FINAL);

    expect(definition.config.name).toBe('Final');
    expect(definition.config.stages[1]?.series.map((series) => series.shots)).toEqual([5, 5]);
    expect(definition.config.stages[2]?.series.map((series) => series.shots)).toEqual(Array(14).fill(1));
    expect(definition.config.stages[2]?.timer).toEqual({ mode: 'shot', durationSec: 50 });
    expect(definition.config.stages[2]?.elimination).toEqual({
      eliminateCount: 1,
      unit: 'series',
      checkpointEverySeries: 2,
      tieBreaker: 'shootoff',
    });
    expect(definition.phaseStartRequirements).toEqual({
      MATCH: [
        expect.objectContaining({
          id: RULE_PACK_TARGET_RESET_REQUIREMENT_ID,
          timing: { durationSeconds: 60, qualifier: 'APPROXIMATE' },
        }),
      ],
    });
    expect(definition.firingWindowDetection).toBeUndefined();
  });

  it('keeps Director clock handling configurable without changing the shared Rule Pack', () => {
    const definition = competitionTypeFromRulePack(ISSF_2026_AR60, {
      firingWindowClockToleranceMilliseconds: 2_500,
      firingWindowTimestampSource: 'OBSERVED_AT',
    });

    expect(definition.firingWindowDetection).toMatchObject({
      timestampSource: 'OBSERVED_AT',
      clockToleranceMilliseconds: 2_500,
    });
    expect(ISSF_2026_AR60.capabilities.firingWindowReview).toBeDefined();
  });

  it('enables team-result checks only when the event publishes team results', () => {
    const individualOnly = competitionTypeFromRulePack(ISSF_2026_AR60);
    const withTeams = competitionTypeFromRulePack(ISSF_2026_AR60, { includeTeamResults: true });

    expect(individualOnly.resultVerification?.topTeamResults).toBe(0);
    expect(withTeams.resultVerification?.topTeamResults).toBe(3);
  });
});
