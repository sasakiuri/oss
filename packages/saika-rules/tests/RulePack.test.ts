import { describe, expect, it } from 'vitest';

import {
  defineRulePack,
  ISSF_2026_AP60,
  ISSF_2026_APMIX30,
  ISSF_2026_ARMIX30,
  ISSF_2026_ARMIX_FINAL,
  ISSF_2026_AR60,
  ISSF_2026_AR60_FINAL,
  RulePackRegistry,
} from '../src';

describe('ISSF 2026 10m Rule Packs', () => {
  it('defines the qualification course and scoring differences without application concerns', () => {
    expect(ISSF_2026_AR60.capabilities.courseOfFire.stages[1]?.timer.durationSeconds).toBe(4500);
    expect(ISSF_2026_AR60.capabilities.ranking.totalShots).toBe(60);
    expect(ISSF_2026_AR60.capabilities.scoring.mode).toBe('DECIMAL');
    expect(ISSF_2026_AP60.capabilities.scoring.mode).toBe('RING');
    expect(ISSF_2026_AP60.capabilities.publication?.scoreProtestWindowSeconds).toBe(600);
    expect(ISSF_2026_AR60.capabilities.commands).toEqual(
      expect.objectContaining({
        athleteCallToLineLeadSeconds: 1500,
        sightingTargetVisibilityLeadSeconds: 600,
        setupPeriodSeconds: 600,
        preparationWarningsAtRemainingSeconds: [30],
        matchWarningsAtRemainingSeconds: [600, 300],
        resetPauseSeconds: 30,
      }),
    );
    expect(ISSF_2026_AR60.capabilities.firingWindowReview?.rules).toEqual([
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
    ]);
  });

  it('defines the 10m final as two five-shot series followed by fourteen single shots', () => {
    const stages = ISSF_2026_AR60_FINAL.capabilities.courseOfFire.stages;

    expect(stages[1]?.series.map((series) => series.shots)).toEqual([5, 5]);
    expect(stages[2]?.series.map((series) => series.shots)).toEqual(Array(14).fill(1));
    expect(stages[2]?.timer).toEqual({ mode: 'shot', durationSeconds: 50 });
    expect(stages[2]?.elimination?.checkpointEverySeries).toBe(2);
    expect(ISSF_2026_AR60_FINAL.capabilities.ranking.totalSeries).toBe(16);
    expect(ISSF_2026_AR60_FINAL.capabilities.verification).toEqual({
      topIndividualResults: 10,
      topTeamResultsWhenPublished: 0,
    });
    expect(ISSF_2026_AR60_FINAL.capabilities.commands?.resetPauseSeconds).toBe(60);
    expect(ISSF_2026_AR60_FINAL.capabilities.publication).toBeUndefined();
    expect(ISSF_2026_AR60_FINAL.capabilities.firingWindowReview).toBeUndefined();

    const script = ISSF_2026_AR60_FINAL.capabilities.commands?.finalScript;
    expect(script?.version).toBe('ISSF-2026-02');
    expect(script?.main.find((step) => step.id.endsWith('.athletes-to-line'))?.timing).toEqual({
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -600,
    });
    expect(script?.main.find((step) => step.id.endsWith('.start-FIRST_STAGE-1'))).toMatchObject({
      text: 'START',
      timing: { mode: 'SCHEDULED_START_OFFSET', offsetSeconds: 0 },
      effect: {
        type: 'OPEN_FIRING',
        purpose: 'MATCH',
        durationSeconds: 250,
        shotsPerParticipant: 5,
        target: { stageId: 'FIRST_STAGE', stageIndex: 1, seriesIndex: 0 },
      },
    });
    expect(script?.main.filter((step) => step.effect.type === 'CHECKPOINT')).toHaveLength(7);
    expect(script?.shootOff.find((step) => step.effect.type === 'OPEN_FIRING')).toMatchObject({
      effect: {
        purpose: 'SHOOT_OFF',
        participantSelection: 'TIED_ONLY',
        durationSeconds: 50,
        shotsPerParticipant: 1,
      },
    });
  });

  it('defines Mixed Team Qualification and Final courses and composition', () => {
    expect(ISSF_2026_ARMIX30.capabilities.ranking).toMatchObject({ totalShots: 30, totalSeries: 3 });
    expect(ISSF_2026_ARMIX30.capabilities.courseOfFire.stages[1]?.timer).toEqual({
      mode: 'stage',
      durationSeconds: 2400,
    });
    expect(ISSF_2026_ARMIX30.capabilities.scoring.mode).toBe('DECIMAL');
    expect(ISSF_2026_APMIX30.capabilities.scoring.mode).toBe('RING');
    expect(ISSF_2026_ARMIX30.capabilities.team).toEqual({
      format: 'MIXED_PAIR',
      membersPerTeam: 2,
      maximumTeamsPerNation: 2,
      requiredGenders: ['F', 'M'],
    });
    expect(ISSF_2026_ARMIX30.capabilities.publication?.scoreProtestWindowSeconds).toBe(600);
    expect(ISSF_2026_ARMIX30.capabilities.firingWindowReview?.rules).toEqual([
      expect.objectContaining({
        id: 'issf.6.18.2.4.d.before-preparation-start',
        kind: 'BEFORE_PREPARATION_AND_SIGHTING_START',
        ruleReference: '6.18.2.4(d)',
      }),
      expect.objectContaining({
        id: 'issf.6.18.2.4.g.between-phases',
        kind: 'BETWEEN_PREPARATION_AND_SIGHTING_STOP_AND_MATCH_START',
        ruleReference: '6.18.2.4(g)',
      }),
      expect.objectContaining({
        id: 'issf.6.11.1.3.after-match-stop',
        kind: 'AFTER_MATCH_STOP',
      }),
    ]);

    const stages = ISSF_2026_ARMIX_FINAL.capabilities.courseOfFire.stages;
    expect(stages[1]?.series.map((series) => series.shots)).toEqual([5, 5, 5]);
    expect(stages[2]?.series.map((series) => series.shots)).toEqual(Array(9).fill(1));
    expect(stages[2]?.elimination?.checkpointEverySeries).toBe(3);
    expect(ISSF_2026_ARMIX_FINAL.capabilities.ranking).toMatchObject({
      totalShots: 24,
      totalSeries: 12,
      stage1Shots: 15,
    });
    expect(ISSF_2026_ARMIX_FINAL.capabilities.verification).toEqual({
      topIndividualResults: 0,
      topTeamResultsWhenPublished: 3,
    });
    expect(
      ISSF_2026_ARMIX_FINAL.capabilities.commands?.finalScript?.main.filter(
        (step) => step.effect.type === 'CHECKPOINT',
      ),
    ).toHaveLength(3);
  });

  it('selects a Rule Pack by event and effective date', () => {
    const registry = new RulePackRegistry([ISSF_2026_AR60]);

    expect(registry.findForEvent('AR60', '2026-07-01')?.id).toBe(ISSF_2026_AR60.id);
    expect(registry.findForEvent('AR60', '2026-06-30')).toBeNull();
  });

  it('rejects invalid authority dates and command timing boundaries', () => {
    expect(() =>
      defineRulePack({
        ...ISSF_2026_AR60,
        id: 'TEST:INVALID-DATE',
        authority: { ...ISSF_2026_AR60.authority, effectiveFrom: '2026-02-30' },
      }),
    ).toThrow('authority.effectiveFrom must use YYYY-MM-DD');

    const commands = ISSF_2026_AR60.capabilities.commands;
    expect(commands).toBeDefined();
    if (!commands) throw new Error('Expected commands capability');
    expect(() =>
      defineRulePack({
        ...ISSF_2026_AR60,
        id: 'TEST:INVALID-WARNING',
        capabilities: {
          ...ISSF_2026_AR60.capabilities,
          commands: {
            ...commands,
            preparationWarningsAtRemainingSeconds: [900],
          },
        },
      }),
    ).toThrow('commands.preparationWarningsAtRemainingSeconds must occur before the timer starts');

    for (const field of ['athleteCallToLineLeadSeconds', 'sightingTargetVisibilityLeadSeconds'] as const) {
      expect(() =>
        defineRulePack({
          ...ISSF_2026_AR60,
          id: `TEST:INVALID-${field}`,
          capabilities: {
            ...ISSF_2026_AR60.capabilities,
            commands: { ...commands, [field]: 0 },
          },
        }),
      ).toThrow(`commands.${field} must be a positive integer`);
    }

    expect(() =>
      defineRulePack({
        ...ISSF_2026_AR60,
        id: 'TEST:DUPLICATE-FIRING-WINDOW-RULE',
        capabilities: {
          ...ISSF_2026_AR60.capabilities,
          firingWindowReview: {
            rules: [
              ISSF_2026_AR60.capabilities.firingWindowReview!.rules[0]!,
              ISSF_2026_AR60.capabilities.firingWindowReview!.rules[0]!,
            ],
          },
        },
      }),
    ).toThrow('firingWindowReview.rules must have unique IDs');

    expect(() =>
      defineRulePack({
        ...ISSF_2026_AR60_FINAL,
        id: 'TEST:INVALID-FINAL-SCRIPT',
        capabilities: {
          ...ISSF_2026_AR60_FINAL.capabilities,
          commands: {
            ...ISSF_2026_AR60_FINAL.capabilities.commands!,
            finalScript: {
              ...ISSF_2026_AR60_FINAL.capabilities.commands!.finalScript!,
              main: ISSF_2026_AR60_FINAL.capabilities.commands!.finalScript!.main.map((step) =>
                step.effect.type === 'OPEN_FIRING' && step.effect.purpose === 'MATCH'
                  ? { ...step, effect: { ...step.effect, durationSeconds: step.effect.durationSeconds + 1 } }
                  : step,
              ),
            },
          },
        },
      }),
    ).toThrow('duration must match its course-of-fire timer');
  });
});
