import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
  defineRulePack,
  identifyRulePack,
  ISSF_2026_AP60,
  ISSF_2026_APMIX30,
  ISSF_2026_ARMIX30,
  ISSF_2026_ARMIX_FINAL,
  ISSF_2026_AR60,
  ISSF_2026_AR60_FINAL,
  ISSF_2026_R3P60,
  ISSF_2026_R3P60_ELIMINATION,
  ISSF_2026_R3P60_INDOOR,
  ISSF_2026_R3P_FINAL,
  ISSF_2026_RPR60,
  ISSF_2026_RPR60_ELIMINATION,
  RulePackRegistry,
} from '../src';

describe('ISSF 2026 10m Rule Packs', () => {
  it('identifies the exact canonical Rule Pack content with SHA-256', () => {
    const identity = identifyRulePack(ISSF_2026_AR60);

    expect(identity).toEqual({
      id: ISSF_2026_AR60.id,
      schemaVersion: 1,
      fingerprint: {
        algorithm: 'SHA-256',
        value: createHash('sha256').update(canonicalJson(ISSF_2026_AR60)).digest('hex'),
      },
    });
    expect(identity.fingerprint.value).toMatch(/^[a-f0-9]{64}$/);
    expect(
      identifyRulePack({
        ...ISSF_2026_AR60,
        displayName: `${ISSF_2026_AR60.displayName} changed`,
      }).fingerprint.value,
    ).not.toBe(identity.fingerprint.value);
  });

  it('defines the qualification course and scoring differences without application concerns', () => {
    expect(ISSF_2026_AR60.capabilities.courseOfFire.stages[1]?.timer.durationSeconds).toBe(4500);
    expect(ISSF_2026_AR60.capabilities.ranking.totalShots).toBe(60);
    expect(ISSF_2026_AR60.capabilities.scoring.mode).toBe('DECIMAL');
    expect(ISSF_2026_AR60.capabilities.target.scoringGaugeProfileId).toBe('ISSF_AIR_4_50_2026');
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
    expect(script?.version).toBe('ISSF-2026-02-conformance-2');
    expect(script?.source).toEqual({
      organization: 'ISSF',
      title: 'Commands and Announcements for Finals 2026',
      version: 'February 2026',
    });
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
    expect(script?.main.map((step) => step.id)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\.presentation$/),
        expect.stringMatching(/\.match-targets-ready$/),
        expect.stringMatching(/\.safety-12$/),
        expect.stringMatching(/\.safety-24$/),
        expect.stringMatching(/\.completion-clearance$/),
        expect.stringMatching(/\.declare-results$/),
        expect.stringMatching(/\.medallist-presentation$/),
      ]),
    );
    const declarationIndex = script?.main.findIndex((step) => step.effect.type === 'DECLARE_RESULTS') ?? -1;
    expect(script?.main[declarationIndex - 1]?.id).toMatch(/\.completion-clearance$/);
    expect(script?.main[declarationIndex + 1]?.id).toMatch(/\.medallist-presentation$/);
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

  it('defines selectable 50m qualification timings, positions, and scoring', () => {
    const outdoor = ISSF_2026_R3P60.capabilities.courseOfFire.stages[1]!;
    const indoor = ISSF_2026_R3P60_INDOOR.capabilities.courseOfFire.stages[1]!;

    expect(outdoor.timer).toEqual({ mode: 'stage', durationSeconds: 6300 });
    expect(indoor.timer).toEqual({ mode: 'stage', durationSeconds: 5400 });
    expect(outdoor.series.map((series) => series.position)).toEqual([
      'KNEELING',
      'KNEELING',
      'PRONE',
      'PRONE',
      'STANDING',
      'STANDING',
    ]);
    expect(outdoor.series[2]?.targetModeControl).toBe('ATHLETE');
    expect(outdoor.series[4]?.targetModeControl).toBe('ATHLETE');
    expect(ISSF_2026_R3P60.capabilities.scoring).toMatchObject({ mode: 'RING', precision: 0 });
    expect(ISSF_2026_R3P60.capabilities.target.scoringGaugeProfileId).toBe('ISSF_SMALLBORE_5_60_2026');
    expect(ISSF_2026_R3P60.capabilities.ranking).toMatchObject({ totalShots: 60, totalSeries: 6 });

    expect(ISSF_2026_RPR60.capabilities.courseOfFire.stages[1]?.timer.durationSeconds).toBe(3000);
    expect(ISSF_2026_RPR60.capabilities.scoring).toMatchObject({ mode: 'DECIMAL', precision: 1 });
    expect(ISSF_2026_RPR60.capabilities.ranking.strategy).toBe('ISSF_6_15_1_DECIMAL_RIFLE');
  });

  it('defines full-course outdoor Elimination variants with venue planning metadata', () => {
    for (const pack of [ISSF_2026_R3P60_ELIMINATION, ISSF_2026_RPR60_ELIMINATION]) {
      expect(pack.round).toBe('ELIMINATION');
      expect(pack.capabilities.ranking.totalShots).toBe(60);
      expect(pack.capabilities.outdoorEliminationPlanning).toEqual(
        expect.objectContaining({
          requiredWhenEntriesExceedUsableCapacity: true,
          quotaMethod: 'PROPORTIONAL_RELAY_STARTS',
          minimumQualificationAthletes: 12,
        }),
      );
    }
  });

  it('models the 50m 3 Positions Final shared 22-minute block and non-uniform checkpoints', () => {
    const stages = ISSF_2026_R3P_FINAL.capabilities.courseOfFire.stages;
    expect(stages[1]?.timer).toEqual({ mode: 'stage', durationSeconds: 1320 });
    expect(stages[1]?.series).toEqual([
      expect.objectContaining({ shots: 10, position: 'KNEELING' }),
      expect.objectContaining({ shots: 10, position: 'PRONE', targetModeControl: 'ATHLETE' }),
      expect.objectContaining({
        shots: 0,
        position: 'STANDING',
        purpose: 'POSITION_CHANGE_AND_SIGHTING',
        targetModeControl: 'ATHLETE',
      }),
    ]);
    expect(stages[2]?.series.map((series) => series.shots)).toEqual([5, 5]);
    expect(stages[3]?.series.map((series) => series.shots)).toEqual([1, 1, 1, 1, 1]);
    expect(ISSF_2026_R3P_FINAL.capabilities.ranking).toMatchObject({
      totalShots: 35,
      totalSeries: 9,
      stage1Shots: 30,
      finalCheckpoints: [
        expect.objectContaining({
          afterMatchShot: 30,
          rank: 8,
          tieResolution: expect.objectContaining({
            type: 'COUNTBACK_FOR_EXACT_TIE',
            athleteCount: 2,
            otherwise: 'SHOOT_OFF',
          }),
        }),
        { afterMatchShot: 30, rank: 7 },
        { afterMatchShot: 31, rank: 6 },
        { afterMatchShot: 32, rank: 5 },
        { afterMatchShot: 33, rank: 4 },
        { afterMatchShot: 34, rank: 3 },
        { afterMatchShot: 35, rank: 2 },
      ],
    });

    const script = ISSF_2026_R3P_FINAL.capabilities.commands?.finalScript;
    expect(script?.version).toBe('ISSF-2026-02-50m-3p-conformance-2');
    expect(script?.main.find((step) => step.id.endsWith('.start-kneeling-prone'))).toMatchObject({
      text: 'MATCH FIRING ... START',
      effect: {
        type: 'OPEN_FIRING',
        durationSeconds: 1320,
        shotsPerParticipant: 20,
        target: {
          stageId: 'KNEELING_PRONE_CHANGEOVER',
          stageIndex: 1,
          seriesIndex: 0,
          seriesCount: 2,
        },
      },
    });
    expect(
      script?.main.filter((step) => step.effect.type === 'CHECKPOINT' && step.effect.afterMatchShot === 30),
    ).toHaveLength(2);
    expect(script?.main.find((step) => step.id.endsWith('.five-minutes'))?.timing).toEqual({
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: 1020,
    });
    expect(script?.main.find((step) => step.id.endsWith('.thirty-seconds'))?.timing).toEqual({
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: 1290,
    });
    expect(script?.main.find((step) => step.id.endsWith('.stop-kneeling-prone'))?.timing).toEqual({
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: 1320,
    });
    expect(script?.main.find((step) => step.id.endsWith('.stop-shot-35'))?.text).toBe('STOP ... UNLOAD');
    expect(script?.main.at(-2)?.effect.type).toBe('DECLARE_RESULTS');
    expect(script?.main.at(-1)?.id).toMatch(/medallist-presentation$/);
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
