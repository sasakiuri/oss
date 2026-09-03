import { describe, expect, it } from 'vitest';

import {
  defineRulePack,
  ISSF_2026_25M_PISTOL_FINAL_RULE_PACKS,
  ISSF_2026_25M_PISTOL_QUALIFICATION_RULE_PACKS,
  ISSF_2026_25M_PISTOL_RULE_PACKS,
  ISSF_2026_CFP,
  ISSF_2026_P25,
  ISSF_2026_P25_FINAL,
  ISSF_2026_RFPM,
  ISSF_2026_RFPM_FINAL,
  ISSF_2026_STDP,
} from '../src';

describe('ISSF 2026 25m Pistol Rule Packs', () => {
  it('defines every Qualification course as 60 shots in twelve five-shot series', () => {
    expect(ISSF_2026_25M_PISTOL_QUALIFICATION_RULE_PACKS).toHaveLength(4);
    for (const pack of ISSF_2026_25M_PISTOL_QUALIFICATION_RULE_PACKS) {
      expect(pack.discipline).toBe('PISTOL_25M');
      expect(pack.round).toBe('QUALIFICATION');
      expect(pack.capabilities.ranking).toMatchObject({ totalShots: 60, totalSeries: 12 });
      expect(pack.capabilities.scoring).toMatchObject({ mode: 'RING', maximumSeriesScore: 50 });
      expect(pack.capabilities.courseOfFire.stages[0]?.timer).toEqual({ mode: 'stage', durationSeconds: 180 });
    }
  });

  it('publishes Qualification and Final packs as separate composable groups', () => {
    expect(ISSF_2026_25M_PISTOL_FINAL_RULE_PACKS).toEqual([ISSF_2026_RFPM_FINAL, ISSF_2026_P25_FINAL]);
    expect(ISSF_2026_25M_PISTOL_RULE_PACKS).toHaveLength(6);
  });

  it('models the Rapid Fire Men Final threshold, firing series, eliminations and malfunction remedy', () => {
    expect(ISSF_2026_RFPM_FINAL.capabilities.resultProjection).toMatchObject({
      type: 'HIT_MISS',
      hitThresholdX10: 97,
      preserveSourceScore: true,
    });
    expect(ISSF_2026_RFPM_FINAL.capabilities.ranking).toMatchObject({
      totalShots: 40,
      totalSeries: 8,
      stage1Shots: 15,
    });
    expect(ISSF_2026_RFPM_FINAL.capabilities.ranking.finalCheckpoints).toEqual([
      { afterMatchShot: 15, rank: 8, tieResolution: finalsStartNumberTieResolutionForTest() },
      { afterMatchShot: 15, rank: 7, tieResolution: finalsStartNumberTieResolutionForTest() },
      { afterMatchShot: 20, rank: 6, tieResolution: finalsStartNumberTieResolutionForTest() },
      { afterMatchShot: 25, rank: 5, tieResolution: finalsStartNumberTieResolutionForTest() },
      { afterMatchShot: 30, rank: 4, tieResolution: { type: 'SHOOT_OFF' } },
      { afterMatchShot: 35, rank: 3, tieResolution: { type: 'SHOOT_OFF' } },
      { afterMatchShot: 40, rank: 2, tieResolution: { type: 'SHOOT_OFF' } },
    ]);
    expect(ISSF_2026_RFPM_FINAL.capabilities.timedTarget?.recovery).toMatchObject({
      procedure: 'FINAL',
      allowableMalfunctionRemedy: 'REPEAT_SERIES',
      remedyReadySeconds: 20,
      nonAllowableMalfunctionPenaltyHits: 2,
    });
    expect(ISSF_2026_RFPM_FINAL.capabilities.finalSeriesAdjudication?.incidents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'LATE_OR_UNFIRED_SHOT',
          consequences: [expect.objectContaining({ action: 'DEDUCT', amount: 1, unit: 'HITS' })],
        }),
        expect.objectContaining({ kind: 'MULTIPLE_SHOTS_SAME_TARGET' }),
        expect.objectContaining({ kind: 'READY_POSITION', minimumConcurringJuryMembers: 2 }),
      ]),
    );
  });

  it('models the Pistol Women Final threshold, rapid sequence, eliminations and malfunction remedy', () => {
    expect(ISSF_2026_P25_FINAL.capabilities.resultProjection).toMatchObject({
      type: 'HIT_MISS',
      hitThresholdX10: 102,
      preserveSourceScore: true,
    });
    expect(ISSF_2026_P25_FINAL.capabilities.ranking).toMatchObject({
      totalShots: 50,
      totalSeries: 10,
      stage1Shots: 20,
    });
    const matchProgram = ISSF_2026_P25_FINAL.capabilities.timedTarget?.programs.find(
      (program) => program.id === 'P25_FINAL_MATCH_RAPID_3_7',
    );
    expect(matchProgram?.exposures).toHaveLength(5);
    expect(matchProgram?.betweenExposuresMilliseconds).toBe(7_000);
    expect(ISSF_2026_P25_FINAL.capabilities.timedTarget?.recovery).toMatchObject({
      procedure: 'FINAL',
      allowableMalfunctionRemedy: 'COMPLETE_SERIES',
      remedyReadySeconds: 15,
    });
    expect(ISSF_2026_P25_FINAL.capabilities.finalSeriesAdjudication?.incidents).toEqual([
      expect.objectContaining({
        kind: 'READY_POSITION',
        ruleReference: '6.17.5(j)',
        consequences: [
          expect.objectContaining({ action: 'DEDUCT', amount: 2, unit: 'HITS' }),
          expect.objectContaining({ action: 'DISQUALIFY', classification: 'DSQ' }),
        ],
      }),
    ]);
  });

  it('provides executable, versioned 25m Final scripts without coupling them to an application transport', () => {
    const womenScript = ISSF_2026_P25_FINAL.capabilities.commands?.finalScript;
    const womenPrograms = womenScript?.main.filter((step) => step.effect.type === 'RUN_TIMED_TARGET') ?? [];
    expect(womenScript?.source?.title).toContain('25m Pistol Women');
    expect(womenPrograms).toHaveLength(11);
    expect(womenPrograms.at(0)?.effect).toMatchObject({
      type: 'RUN_TIMED_TARGET',
      purpose: 'SIGHTING',
      programId: 'P25_FINAL_SIGHTING_RAPID_3_7',
      participantSelection: 'ALL_ACTIVE',
    });
    expect(
      womenScript?.shootOff.find(
        (step) => step.effect.type === 'RUN_TIMED_TARGET' && step.effect.purpose === 'SHOOT_OFF',
      )?.effect,
    ).toMatchObject({
      type: 'RUN_TIMED_TARGET',
      purpose: 'SHOOT_OFF',
      programId: 'P25_FINAL_SHOOT_OFF_RAPID_3_7',
      shotsPerParticipant: 5,
      participantExecution: 'SIMULTANEOUS',
    });
    expect(
      ISSF_2026_P25_FINAL.capabilities.timedTarget?.programs.find(
        (program) => program.id === 'P25_FINAL_SHOOT_OFF_RAPID_3_7',
      ),
    ).toMatchObject({ purpose: 'SHOOT_OFF', ruleReference: expect.stringContaining('6.17.5(f,h)') });

    const rapidScript = ISSF_2026_RFPM_FINAL.capabilities.commands?.finalScript;
    const rapidPrograms =
      rapidScript?.main.flatMap((step) => (step.effect.type === 'RUN_TIMED_TARGET' ? [step.effect] : [])) ?? [];
    expect(rapidScript?.source?.title).toContain('25m Rapid Fire Pistol Men');
    expect(rapidPrograms.filter((effect) => effect.requiredParticipantCount === 2)).toHaveLength(16);
    expect(rapidPrograms.filter((effect) => effect.requiredParticipantCount === 1)).toHaveLength(20);
    expect(
      rapidScript?.main.filter((step) => step.effect.type === 'CHECKPOINT' && step.effect.afterMatchShot === 15),
    ).toHaveLength(2);
    expect(
      rapidScript?.shootOff.find(
        (step) => step.effect.type === 'RUN_TIMED_TARGET' && step.effect.purpose === 'SHOOT_OFF',
      )?.effect,
    ).toMatchObject({
      type: 'RUN_TIMED_TARGET',
      purpose: 'SHOOT_OFF',
      programId: 'RFPM_FINAL_SHOOT_OFF_4',
      shotsPerParticipant: 5,
      participantExecution: 'SEQUENTIAL',
      participantOrder: 'FINAL_START_NUMBER_ASCENDING',
    });
    expect(
      ISSF_2026_RFPM_FINAL.capabilities.timedTarget?.programs.find(
        (program) => program.id === 'RFPM_FINAL_SHOOT_OFF_4',
      ),
    ).toMatchObject({ purpose: 'SHOOT_OFF', ruleReference: expect.stringContaining('6.17.4(i,k)') });
  });

  it('models Rapid Fire Pistol as two 30-shot stages with 8, 6 and 4 second pairs', () => {
    const matchStages = ISSF_2026_RFPM.capabilities.courseOfFire.stages.slice(1);
    expect(matchStages).toHaveLength(2);
    expect(matchStages.map((stage) => stage.series.reduce((sum, series) => sum + series.shots, 0))).toEqual([30, 30]);
    expect(matchStages.flatMap((stage) => stage.series.map((series) => series.timedTargetProgramId))).toEqual([
      'RFP_MATCH_8',
      'RFP_MATCH_8',
      'RFP_MATCH_6',
      'RFP_MATCH_6',
      'RFP_MATCH_4',
      'RFP_MATCH_4',
      'RFP_MATCH_8',
      'RFP_MATCH_8',
      'RFP_MATCH_6',
      'RFP_MATCH_6',
      'RFP_MATCH_4',
      'RFP_MATCH_4',
    ]);
    expect(matchStages[0]?.sightingTimedTargetProgramId).toBe('RFP_SIGHTING_8');
    expect(matchStages[1]?.sightingTimedTargetProgramId).toBe('RFP_SIGHTING_8');
    expect(ISSF_2026_RFPM.capabilities.timedTarget?.recovery).toMatchObject({
      interruptedSeriesTreatment: 'ANNUL_AND_REPEAT',
      malfunctionClaims: { maximum: 1, scope: 'EACH_30_SHOT_STAGE' },
    });
  });

  it('keeps green-light tolerance and EST after-time as separate boundaries', () => {
    const program = ISSF_2026_RFPM.capabilities.timedTarget?.programs.find((entry) => entry.id === 'RFP_MATCH_4');
    expect(program).toMatchObject({
      loadPreparationSeconds: 60,
      attentionDelayMilliseconds: 7_000,
      attentionToleranceMilliseconds: 100,
      minimumPauseAfterSeconds: 60,
      exposures: [
        {
          nominalDurationMilliseconds: 4_000,
          signalExtensionMilliseconds: 100,
          recordingAfterTimeMilliseconds: 200,
          maximumShots: 5,
        },
      ],
    });
  });

  it('models the 25m Pistol and Centre Fire precision and five-appearance rapid stages', () => {
    for (const pack of [ISSF_2026_P25, ISSF_2026_CFP]) {
      const [, precision, rapid] = pack.capabilities.courseOfFire.stages;
      expect(precision?.series).toHaveLength(6);
      expect(precision?.targetProfileId).toBe('ISSF_PISTOL_25M_PRECISION_2026');
      expect(rapid?.series).toHaveLength(6);
      expect(rapid?.targetProfileId).toBe('ISSF_PISTOL_25M_RAPID_FIRE_2026');
      const duel = pack.capabilities.timedTarget?.programs.find(
        (program) => program.id === `${pack.eventCode}_MATCH_RAPID_3_7`,
      );
      expect(duel?.betweenExposuresMilliseconds).toBe(7_000);
      expect(duel?.exposures).toHaveLength(5);
      expect(duel?.exposures.every((entry) => entry.maximumShots === 1)).toBe(true);
      expect(pack.capabilities.timedTarget?.recovery).toMatchObject({
        interruptedSeriesTreatment: 'COMPLETE_REMAINING_SHOTS',
        precisionCompletionSecondsPerShot: 48,
      });
    }
    expect(ISSF_2026_P25.capabilities.target.scoringGaugeProfileId).toBe('ISSF_SMALLBORE_5_60_2026');
    expect(ISSF_2026_CFP.capabilities.target.scoringGaugeProfileId).toBe('ISSF_CENTER_FIRE_9_65_2026');
  });

  it('models Standard Pistol as four series at 150, 20 and 10 seconds', () => {
    const matchStages = ISSF_2026_STDP.capabilities.courseOfFire.stages.slice(1);
    expect(matchStages.map((stage) => stage.timer.durationSeconds)).toEqual([150, 20, 10]);
    expect(matchStages.map((stage) => stage.series.length)).toEqual([4, 4, 4]);
    expect(ISSF_2026_STDP.capabilities.timedTarget?.recovery.malfunctionClaims).toEqual({
      maximum: 2,
      scope: 'SIXTY_SHOT_MATCH',
      exceptionalTwoPartMaximumPerPart: 1,
    });
  });

  it('rejects an exposure program whose shot limit disagrees with the referenced series', () => {
    expect(() =>
      defineRulePack({
        ...ISSF_2026_RFPM,
        id: 'TEST:25M:INVALID-SHOT-LIMIT',
        capabilities: {
          ...ISSF_2026_RFPM.capabilities,
          timedTarget: {
            ...ISSF_2026_RFPM.capabilities.timedTarget!,
            programs: ISSF_2026_RFPM.capabilities.timedTarget!.programs.map((program) =>
              program.id === 'RFP_MATCH_8'
                ? { ...program, exposures: [{ ...program.exposures[0]!, maximumShots: 4 }] }
                : program,
            ),
          },
        },
      }),
    ).toThrow('shot limit must match its course-of-fire series');
  });
});

function finalsStartNumberTieResolutionForTest() {
  return { type: 'FINAL_START_NUMBER', lowerNumberRanksHigher: true } as const;
}
