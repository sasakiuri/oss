import {
  defineRulePack,
  type RulePack,
  type RuleSeries,
  type TimedTargetProgram,
  type TimedTargetPurpose,
} from '../RulePack';

import {
  buildIssf25mPistolWomenFinalCommandScript,
  buildIssf25mRapidFirePistolMenFinalCommandScript,
} from './pistol25mFinalCommandScript';

const authority = {
  organization: 'ISSF',
  edition: '2025 Edition (Second Print 07/2026)',
  effectiveFrom: '2026-07-01',
  ruleReferences: ['6.4.12', '6.4.13', '8.7.6', '8.8.1', '8.8.2.3', '8.9.1'],
} as const;

const publication = { preliminaryRequired: true, scoreProtestWindowSeconds: 600 } as const;
const verification = { topIndividualResults: 10, topTeamResultsWhenPublished: 3 } as const;

const preparationStage = {
  id: 'PREPARATION',
  name: 'Preparation',
  phase: 'PREPARATION',
  series: [{ shots: 0 }],
  timer: { mode: 'stage', durationSeconds: 180 },
  requiresNewSession: false,
} as const;

function exposure(nominalDurationMilliseconds: number, maximumShots: number) {
  return {
    nominalDurationMilliseconds,
    signalExtensionMilliseconds: 100,
    recordingAfterTimeMilliseconds: 200,
    maximumShots,
  } as const;
}

function singleExposureProgram(input: {
  id: string;
  label: string;
  purpose: 'SIGHTING' | 'MATCH';
  seconds: number;
  ruleReference: string;
}): TimedTargetProgram {
  return {
    id: input.id,
    label: input.label,
    purpose: input.purpose,
    ruleReference: input.ruleReference,
    loadPreparationSeconds: 60,
    attentionDelayMilliseconds: 7_000,
    attentionToleranceMilliseconds: 100,
    betweenExposuresMilliseconds: 0,
    minimumPauseAfterSeconds: 60,
    exposures: [exposure(input.seconds * 1_000, 5)],
  };
}

function duelProgram(input: { id: string; label: string; purpose: 'SIGHTING' | 'MATCH' }): TimedTargetProgram {
  return {
    id: input.id,
    label: input.label,
    purpose: input.purpose,
    ruleReference: '6.4.12(c), 6.4.13, 8.7.6.4(i)',
    loadPreparationSeconds: 60,
    attentionDelayMilliseconds: 7_000,
    attentionToleranceMilliseconds: 100,
    betweenExposuresMilliseconds: 7_000,
    minimumPauseAfterSeconds: 60,
    exposures: Array.from({ length: 5 }, () => exposure(3_000, 1)),
  };
}

function timedSeries(programId: string, label: string): RuleSeries {
  return { shots: 5, label, timedTargetProgramId: programId };
}

function rapidFirePrograms(): readonly TimedTargetProgram[] {
  return [
    singleExposureProgram({
      id: 'RFP_SIGHTING_8',
      label: '8 second sighting series',
      purpose: 'SIGHTING',
      seconds: 8,
      ruleReference: '6.4.12(a), 6.4.13, 8.7.6.3(b), 8.7.6.3(f-h)',
    }),
    ...([8, 6, 4] as const).map((seconds) =>
      singleExposureProgram({
        id: `RFP_MATCH_${seconds}`,
        label: `${seconds} second competition series`,
        purpose: 'MATCH',
        seconds,
        ruleReference: '6.4.12(a), 6.4.13, 8.7.6.3(a), 8.7.6.3(e-k)',
      }),
    ),
  ];
}

function rapidFireStage(stageNumber: 1 | 2) {
  const seriesTimes = [8, 8, 6, 6, 4, 4] as const;
  return {
    id: `STAGE_${stageNumber}`,
    name: `Stage ${stageNumber} — 30 shots`,
    phase: 'MATCH' as const,
    series: seriesTimes.map((seconds, index) =>
      timedSeries(`RFP_MATCH_${seconds}`, `${seconds} second series ${(index % 2) + 1}`),
    ),
    // The per-series program is authoritative. This required RuleStage timer
    // is only a nominal fallback and is removed by application adapters.
    timer: { mode: 'series' as const, durationSeconds: 8 },
    requiresNewSession: stageNumber === 1,
    seriesTransition: 'OFFICIAL_COMMAND' as const,
    targetProfileId: 'ISSF_PISTOL_25M_RAPID_FIRE_2026',
    sightingTimedTargetProgramId: 'RFP_SIGHTING_8',
  };
}

export const ISSF_2026_RFPM: RulePack = defineRulePack({
  schemaVersion: 1,
  id: 'ISSF:2026:RFPM:QUALIFICATION',
  eventCode: 'RFPM',
  displayName: '25m Rapid Fire Pistol 60 shots',
  discipline: 'PISTOL_25M',
  round: 'QUALIFICATION',
  authority,
  capabilities: {
    target: {
      scoringProfileId: 'ISSF_PISTOL_25M_RAPID_FIRE_2026',
      scoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
    },
    scoring: { mode: 'RING', minimumShotScore: 0, maximumSeriesScore: 50, precision: 0 },
    courseOfFire: {
      hasRelays: true,
      stages: [preparationStage, rapidFireStage(1), rapidFireStage(2)],
    },
    ranking: { strategy: 'ISSF_6_15_1_FULL_RING', totalShots: 60, totalSeries: 12 },
    verification,
    publication,
    commands: {
      athleteCallToLineLeadSeconds: 600,
      preparationAndSightingSeconds: 180,
      preparationWarningsAtRemainingSeconds: [],
      matchWarningsAtRemainingSeconds: [],
    },
    timedTarget: {
      signalSystem: 'EST_RED_GREEN_OR_TURNING_TARGETS',
      programs: rapidFirePrograms(),
      recovery: {
        procedure: 'QUALIFICATION',
        extraSightingInterruptionThresholdSeconds: 900,
        interruptedSeriesTreatment: 'ANNUL_AND_REPEAT',
        sightingMalfunctionClaimsAllowed: false,
        malfunctionClaims: { maximum: 1, scope: 'EACH_30_SHOT_STAGE' },
        ruleReferences: ['8.8.1(a-b)', '8.9.1(a,c)'],
      },
    },
  },
});

function precisionRapidPrograms(prefix: 'P25' | 'CFP'): readonly TimedTargetProgram[] {
  return [
    singleExposureProgram({
      id: `${prefix}_SIGHTING_PRECISION_240`,
      label: 'Precision sighting series',
      purpose: 'SIGHTING',
      seconds: 240,
      ruleReference: '6.4.13, 8.7.6.4(a,g)',
    }),
    singleExposureProgram({
      id: `${prefix}_MATCH_PRECISION_240`,
      label: 'Precision competition series',
      purpose: 'MATCH',
      seconds: 240,
      ruleReference: '6.4.13, 8.7.6.4(g)',
    }),
    duelProgram({
      id: `${prefix}_SIGHTING_RAPID_3_7`,
      label: 'Rapid-fire sighting series',
      purpose: 'SIGHTING',
    }),
    duelProgram({
      id: `${prefix}_MATCH_RAPID_3_7`,
      label: 'Rapid-fire competition series',
      purpose: 'MATCH',
    }),
  ];
}

function precisionRapidPack(input: { eventCode: 'P25' | 'CFP'; displayName: string }): RulePack {
  const prefix = input.eventCode;
  return defineRulePack({
    schemaVersion: 1,
    id: `ISSF:2026:${input.eventCode}:QUALIFICATION`,
    eventCode: input.eventCode,
    displayName: input.displayName,
    discipline: 'PISTOL_25M',
    round: 'QUALIFICATION',
    authority,
    capabilities: {
      target: {
        scoringProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
        scoringGaugeProfileId: input.eventCode === 'CFP' ? 'ISSF_CENTER_FIRE_9_65_2026' : 'ISSF_SMALLBORE_5_60_2026',
      },
      scoring: { mode: 'RING', minimumShotScore: 0, maximumSeriesScore: 50, precision: 0 },
      courseOfFire: {
        hasRelays: true,
        stages: [
          preparationStage,
          {
            id: 'PRECISION_STAGE',
            name: 'Precision Stage',
            phase: 'MATCH',
            series: Array.from({ length: 6 }, (_, index) =>
              timedSeries(`${prefix}_MATCH_PRECISION_240`, `Precision series ${index + 1}`),
            ),
            timer: { mode: 'series', durationSeconds: 240 },
            requiresNewSession: true,
            seriesTransition: 'OFFICIAL_COMMAND',
            targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
            sightingTimedTargetProgramId: `${prefix}_SIGHTING_PRECISION_240`,
          },
          {
            id: 'RAPID_FIRE_STAGE',
            name: 'Rapid-Fire Stage',
            phase: 'MATCH',
            series: Array.from({ length: 6 }, (_, index) =>
              timedSeries(`${prefix}_MATCH_RAPID_3_7`, `Rapid-fire series ${index + 1}`),
            ),
            // Nominal duration of each individual exposure; the timed-target
            // capability supplies the five exposure/red intervals and EST after-time.
            timer: { mode: 'series', durationSeconds: 3 },
            requiresNewSession: false,
            seriesTransition: 'OFFICIAL_COMMAND',
            targetProfileId: 'ISSF_PISTOL_25M_RAPID_FIRE_2026',
            sightingTimedTargetProgramId: `${prefix}_SIGHTING_RAPID_3_7`,
          },
        ],
      },
      ranking: { strategy: 'ISSF_6_15_1_FULL_RING', totalShots: 60, totalSeries: 12 },
      verification,
      publication,
      commands: {
        athleteCallToLineLeadSeconds: 600,
        preparationAndSightingSeconds: 180,
        preparationWarningsAtRemainingSeconds: [],
        matchWarningsAtRemainingSeconds: [],
      },
      timedTarget: {
        signalSystem: 'EST_RED_GREEN_OR_TURNING_TARGETS',
        programs: precisionRapidPrograms(prefix),
        recovery: {
          procedure: 'QUALIFICATION',
          extraSightingInterruptionThresholdSeconds: 900,
          interruptedSeriesTreatment: 'COMPLETE_REMAINING_SHOTS',
          precisionCompletionSecondsPerShot: 48,
          sightingMalfunctionClaimsAllowed: false,
          malfunctionClaims: { maximum: 1, scope: 'EACH_30_SHOT_STAGE' },
          ruleReferences: ['8.8.1(a,c-d)', '8.9.1(a,c)'],
        },
      },
    },
  });
}

export const ISSF_2026_P25 = precisionRapidPack({
  eventCode: 'P25',
  displayName: '25m Pistol 60 shots',
});

export const ISSF_2026_CFP = precisionRapidPack({
  eventCode: 'CFP',
  displayName: '25m Centre Fire Pistol 60 shots',
});

function standardPrograms(): readonly TimedTargetProgram[] {
  return [
    singleExposureProgram({
      id: 'STDP_SIGHTING_150',
      label: '150 second sighting series',
      purpose: 'SIGHTING',
      seconds: 150,
      ruleReference: '6.4.12(b), 6.4.13, 8.7.6.5(a)',
    }),
    ...([150, 20, 10] as const).map((seconds) =>
      singleExposureProgram({
        id: `STDP_MATCH_${seconds}`,
        label: `${seconds} second competition series`,
        purpose: 'MATCH',
        seconds,
        ruleReference: '6.4.12(b), 6.4.13, 8.7.6.5(b-g)',
      }),
    ),
  ];
}

function standardStage(seconds: 150 | 20 | 10, index: number) {
  return {
    id: `STAGE_${index}_${seconds}_SECONDS`,
    name: `Stage ${index} — ${seconds} seconds`,
    phase: 'MATCH' as const,
    series: Array.from({ length: 4 }, (_, seriesIndex) =>
      timedSeries(`STDP_MATCH_${seconds}`, `${seconds} second series ${seriesIndex + 1}`),
    ),
    timer: { mode: 'series' as const, durationSeconds: seconds },
    requiresNewSession: index === 1,
    seriesTransition: 'OFFICIAL_COMMAND' as const,
    targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
    ...(index === 1 ? { sightingTimedTargetProgramId: 'STDP_SIGHTING_150' } : {}),
  };
}

export const ISSF_2026_STDP: RulePack = defineRulePack({
  schemaVersion: 1,
  id: 'ISSF:2026:STDP:QUALIFICATION',
  eventCode: 'STDP',
  displayName: '25m Standard Pistol 60 shots',
  discipline: 'PISTOL_25M',
  round: 'QUALIFICATION',
  authority,
  capabilities: {
    target: {
      scoringProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
      scoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
    },
    scoring: { mode: 'RING', minimumShotScore: 0, maximumSeriesScore: 50, precision: 0 },
    courseOfFire: {
      hasRelays: true,
      stages: [preparationStage, standardStage(150, 1), standardStage(20, 2), standardStage(10, 3)],
    },
    ranking: { strategy: 'ISSF_6_15_1_FULL_RING', totalShots: 60, totalSeries: 12 },
    verification,
    publication,
    commands: {
      athleteCallToLineLeadSeconds: 600,
      preparationAndSightingSeconds: 180,
      preparationWarningsAtRemainingSeconds: [],
      matchWarningsAtRemainingSeconds: [],
    },
    timedTarget: {
      signalSystem: 'EST_RED_GREEN_OR_TURNING_TARGETS',
      programs: standardPrograms(),
      recovery: {
        procedure: 'QUALIFICATION',
        extraSightingInterruptionThresholdSeconds: 900,
        interruptedSeriesTreatment: 'ANNUL_AND_REPEAT',
        sightingMalfunctionClaimsAllowed: false,
        malfunctionClaims: {
          maximum: 2,
          scope: 'SIXTY_SHOT_MATCH',
          exceptionalTwoPartMaximumPerPart: 1,
        },
        ruleReferences: ['8.7.6.5(h-i)', '8.8.1(a-b)', '8.9.1(b-c)'],
      },
    },
  },
});

function finalSingleExposureProgram(input: {
  id: string;
  label: string;
  purpose: TimedTargetPurpose;
  minimumPauseAfterSeconds: number;
  ruleReference?: string;
}): TimedTargetProgram {
  return {
    id: input.id,
    label: input.label,
    purpose: input.purpose,
    ruleReference: input.ruleReference ?? '6.4.12(a), 6.4.13, 6.17.4(h-i)',
    // For a Final, starting this schedule corresponds to the CRO's READY cue.
    loadPreparationSeconds: 20,
    attentionDelayMilliseconds: 7_000,
    attentionToleranceMilliseconds: 100,
    betweenExposuresMilliseconds: 0,
    minimumPauseAfterSeconds: input.minimumPauseAfterSeconds,
    exposures: [exposure(4_000, 5)],
  };
}

function rapidFireFinalPrograms(): readonly TimedTargetProgram[] {
  return [
    finalSingleExposureProgram({
      id: 'RFPM_FINAL_SIGHTING_4',
      label: 'Final four-second sighting series',
      purpose: 'SIGHTING',
      minimumPauseAfterSeconds: 10,
    }),
    finalSingleExposureProgram({
      id: 'RFPM_FINAL_MATCH_4',
      label: 'Final four-second match series',
      purpose: 'MATCH',
      minimumPauseAfterSeconds: 10,
    }),
    finalSingleExposureProgram({
      id: 'RFPM_FINAL_SHOOT_OFF_4',
      label: 'Final four-second shoot-off series',
      purpose: 'SHOOT_OFF',
      minimumPauseAfterSeconds: 10,
      ruleReference: '6.4.12(a), 6.4.13, 6.17.4(i,k)',
    }),
  ];
}

function pistolWomenFinalProgram(input: {
  id: string;
  label: string;
  purpose: TimedTargetPurpose;
  ruleReference?: string;
}): TimedTargetProgram {
  return {
    id: input.id,
    label: input.label,
    purpose: input.purpose,
    ruleReference: input.ruleReference ?? '6.4.12(c), 6.4.13, 6.17.5(e-f)',
    // The separate LOAD cue precedes this READY-based schedule.
    loadPreparationSeconds: 20,
    attentionDelayMilliseconds: 7_000,
    attentionToleranceMilliseconds: 100,
    betweenExposuresMilliseconds: 7_000,
    minimumPauseAfterSeconds: 15,
    exposures: Array.from({ length: 5 }, () => exposure(3_000, 1)),
  };
}

function pistolWomenFinalPrograms(): readonly TimedTargetProgram[] {
  return [
    pistolWomenFinalProgram({
      id: 'P25_FINAL_SIGHTING_RAPID_3_7',
      label: 'Final rapid-fire sighting series',
      purpose: 'SIGHTING',
    }),
    pistolWomenFinalProgram({
      id: 'P25_FINAL_MATCH_RAPID_3_7',
      label: 'Final rapid-fire match series',
      purpose: 'MATCH',
    }),
    pistolWomenFinalProgram({
      id: 'P25_FINAL_SHOOT_OFF_RAPID_3_7',
      label: 'Final rapid-fire shoot-off series',
      purpose: 'SHOOT_OFF',
      ruleReference: '6.4.12(c), 6.4.13, 6.17.5(f,h)',
    }),
  ];
}

const finalsStartNumberTieResolution = {
  type: 'FINAL_START_NUMBER',
  lowerNumberRanksHigher: true,
} as const;

const shootOffTieResolution = { type: 'SHOOT_OFF' } as const;

export const ISSF_2026_RFPM_FINAL: RulePack = defineRulePack({
  schemaVersion: 1,
  id: 'ISSF:2026:RFPM:FINAL',
  eventCode: 'RFPM_FINAL',
  displayName: '25m Rapid Fire Pistol Men Final',
  discipline: 'PISTOL_25M',
  round: 'FINAL',
  authority: {
    ...authority,
    ruleReferences: ['6.4.12', '6.4.13', '6.17.4'],
  },
  capabilities: {
    target: {
      scoringProfileId: 'ISSF_PISTOL_25M_RAPID_FIRE_DECIMAL_2026',
      scoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
    },
    scoring: { mode: 'DECIMAL', minimumShotScore: 0, maximumSeriesScore: 109, precision: 1 },
    resultProjection: {
      type: 'HIT_MISS',
      source: 'EFFECTIVE_SCORE_X10',
      hitThresholdX10: 97,
      hitValueX10: 10,
      missValueX10: 0,
      displayUnit: 'HITS',
      preserveSourceScore: true,
      ruleReference: '6.17.4(d)',
    },
    finalSeriesAdjudication: {
      incidents: [
        {
          kind: 'LATE_OR_UNFIRED_SHOT',
          label: 'Late or unfired shot',
          ruleReference: '6.17.4(m)',
          reviewGuidance: [
            'Identify every overtime or unfired shot in the five-shot series and mark an overtime shot OT.',
            'The source shot is a miss; deduct one additional hit from that series for each occurrence.',
          ],
          warningBeforePenalty: false,
          consequences: [
            {
              when: 'EACH_OCCURRENCE',
              action: 'DEDUCT',
              amount: 1,
              unit: 'HITS',
              sourceShotTreatment: 'MISS',
            },
          ],
        },
        {
          kind: 'MULTIPLE_SHOTS_SAME_TARGET',
          label: 'Two shots on the same target',
          ruleReference: '6.17.4(m)',
          reviewGuidance: [
            'Identify the second shot on the same target and count that shot as a miss.',
            'Deduct one additional hit from the score for that series.',
          ],
          warningBeforePenalty: false,
          consequences: [
            {
              when: 'EACH_OCCURRENCE',
              action: 'DEDUCT',
              amount: 1,
              unit: 'HITS',
              sourceShotTreatment: 'MISS',
            },
          ],
        },
        {
          kind: 'READY_POSITION',
          label: 'READY position violation',
          ruleReference: '6.17.4(n)',
          reviewGuidance: [
            'At least two Competition Jury Members must signal that the arm was raised too soon or not lowered sufficiently.',
            'Apply a two-hit deduction for the first violation in the Final and disqualify for a repetition.',
          ],
          minimumConcurringJuryMembers: 2,
          warningBeforePenalty: false,
          consequences: [
            { when: 'FIRST_VIOLATION', action: 'DEDUCT', amount: 2, unit: 'HITS' },
            { when: 'SECOND_OR_LATER', action: 'DISQUALIFY', classification: 'DSQ' },
          ],
        },
      ],
    },
    courseOfFire: {
      hasRelays: false,
      minimumParticipants: 2,
      maximumParticipants: 8,
      stages: [
        {
          id: 'PREPARATION',
          name: 'Preparation',
          phase: 'PREPARATION',
          series: [{ shots: 0 }],
          timer: { mode: 'stage', durationSeconds: 60 },
          requiresNewSession: false,
        },
        {
          id: 'FINAL_SERIES',
          name: 'Four-Second Final Series',
          phase: 'MATCH',
          series: Array.from({ length: 8 }, (_, index) =>
            timedSeries('RFPM_FINAL_MATCH_4', `Final series ${index + 1}`),
          ),
          timer: { mode: 'series', durationSeconds: 4 },
          requiresNewSession: true,
          seriesTransition: 'OFFICIAL_COMMAND',
          targetProfileId: 'ISSF_PISTOL_25M_RAPID_FIRE_DECIMAL_2026',
          sightingTimedTargetProgramId: 'RFPM_FINAL_SIGHTING_4',
        },
      ],
    },
    ranking: {
      strategy: 'FINAL_SCORE',
      totalShots: 40,
      totalSeries: 8,
      stage1Shots: 15,
      finalRuleReference: '6.17.4',
      finalCheckpoints: [
        { afterMatchShot: 15, rank: 8, tieResolution: finalsStartNumberTieResolution },
        { afterMatchShot: 15, rank: 7, tieResolution: finalsStartNumberTieResolution },
        { afterMatchShot: 20, rank: 6, tieResolution: finalsStartNumberTieResolution },
        { afterMatchShot: 25, rank: 5, tieResolution: finalsStartNumberTieResolution },
        { afterMatchShot: 30, rank: 4, tieResolution: shootOffTieResolution },
        { afterMatchShot: 35, rank: 3, tieResolution: shootOffTieResolution },
        { afterMatchShot: 40, rank: 2, tieResolution: shootOffTieResolution },
      ],
    },
    verification: { topIndividualResults: 10, topTeamResultsWhenPublished: 0 },
    commands: {
      athleteCallToLineLeadSeconds: 660,
      preparationAndSightingSeconds: 60,
      preparationWarningsAtRemainingSeconds: [],
      matchWarningsAtRemainingSeconds: [],
      finalScript: buildIssf25mRapidFirePistolMenFinalCommandScript(),
    },
    timedTarget: {
      signalSystem: 'EST_RED_GREEN_OR_TURNING_TARGETS',
      programs: rapidFireFinalPrograms(),
      recovery: {
        procedure: 'FINAL',
        sightingMalfunctionClaimsAllowed: false,
        malfunctionClaims: { maximum: 1, scope: 'FINAL' },
        allowableMalfunctionRemedy: 'REPEAT_SERIES',
        remedyReadySeconds: 20,
        nonAllowableMalfunctionPenaltyHits: 2,
        ruleReferences: ['6.17.4(o)'],
      },
    },
  },
});

export const ISSF_2026_P25_FINAL: RulePack = defineRulePack({
  schemaVersion: 1,
  id: 'ISSF:2026:P25:FINAL',
  eventCode: 'P25_FINAL',
  displayName: '25m Pistol Women Final',
  discipline: 'PISTOL_25M',
  round: 'FINAL',
  authority: {
    ...authority,
    ruleReferences: ['6.4.12', '6.4.13', '6.17.5'],
  },
  capabilities: {
    target: {
      scoringProfileId: 'ISSF_PISTOL_25M_RAPID_FIRE_DECIMAL_2026',
      scoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
    },
    scoring: { mode: 'DECIMAL', minimumShotScore: 0, maximumSeriesScore: 109, precision: 1 },
    resultProjection: {
      type: 'HIT_MISS',
      source: 'EFFECTIVE_SCORE_X10',
      hitThresholdX10: 102,
      hitValueX10: 10,
      missValueX10: 0,
      displayUnit: 'HITS',
      preserveSourceScore: true,
      ruleReference: '6.17.5(c)',
    },
    finalSeriesAdjudication: {
      incidents: [
        {
          kind: 'READY_POSITION',
          label: 'READY position violation',
          ruleReference: '6.17.5(j)',
          reviewGuidance: [
            'At least two Competition Jury Members must signal that the arm was raised too soon or not lowered sufficiently.',
            'Apply a two-hit deduction for the first violation in the Final and disqualify for a second violation.',
          ],
          minimumConcurringJuryMembers: 2,
          warningBeforePenalty: false,
          consequences: [
            { when: 'FIRST_VIOLATION', action: 'DEDUCT', amount: 2, unit: 'HITS' },
            { when: 'SECOND_OR_LATER', action: 'DISQUALIFY', classification: 'DSQ' },
          ],
        },
      ],
    },
    courseOfFire: {
      hasRelays: false,
      minimumParticipants: 2,
      maximumParticipants: 8,
      stages: [
        {
          id: 'PREPARATION',
          name: 'Preparation',
          phase: 'PREPARATION',
          series: [{ shots: 0 }],
          timer: { mode: 'stage', durationSeconds: 120 },
          requiresNewSession: false,
        },
        {
          id: 'FINAL_SERIES',
          name: 'Rapid-Fire Final Series',
          phase: 'MATCH',
          series: Array.from({ length: 10 }, (_, index) =>
            timedSeries('P25_FINAL_MATCH_RAPID_3_7', `Final series ${index + 1}`),
          ),
          timer: { mode: 'series', durationSeconds: 3 },
          requiresNewSession: true,
          seriesTransition: 'OFFICIAL_COMMAND',
          targetProfileId: 'ISSF_PISTOL_25M_RAPID_FIRE_DECIMAL_2026',
          sightingTimedTargetProgramId: 'P25_FINAL_SIGHTING_RAPID_3_7',
        },
      ],
    },
    ranking: {
      strategy: 'FINAL_SCORE',
      totalShots: 50,
      totalSeries: 10,
      stage1Shots: 20,
      finalRuleReference: '6.17.5',
      finalCheckpoints: [
        { afterMatchShot: 20, rank: 8, tieResolution: shootOffTieResolution },
        { afterMatchShot: 25, rank: 7, tieResolution: shootOffTieResolution },
        { afterMatchShot: 30, rank: 6, tieResolution: shootOffTieResolution },
        { afterMatchShot: 35, rank: 5, tieResolution: shootOffTieResolution },
        { afterMatchShot: 40, rank: 4, tieResolution: shootOffTieResolution },
        { afterMatchShot: 45, rank: 3, tieResolution: shootOffTieResolution },
        { afterMatchShot: 50, rank: 2, tieResolution: shootOffTieResolution },
      ],
    },
    verification: { topIndividualResults: 10, topTeamResultsWhenPublished: 0 },
    commands: {
      athleteCallToLineLeadSeconds: 600,
      preparationAndSightingSeconds: 120,
      preparationWarningsAtRemainingSeconds: [],
      matchWarningsAtRemainingSeconds: [],
      finalScript: buildIssf25mPistolWomenFinalCommandScript(),
    },
    timedTarget: {
      signalSystem: 'EST_RED_GREEN_OR_TURNING_TARGETS',
      programs: pistolWomenFinalPrograms(),
      recovery: {
        procedure: 'FINAL',
        sightingMalfunctionClaimsAllowed: false,
        malfunctionClaims: { maximum: 1, scope: 'FINAL' },
        allowableMalfunctionRemedy: 'COMPLETE_SERIES',
        remedyReadySeconds: 15,
        ruleReferences: ['6.17.5(k)'],
      },
    },
  },
});

export const ISSF_2026_25M_PISTOL_QUALIFICATION_RULE_PACKS = Object.freeze([
  ISSF_2026_RFPM,
  ISSF_2026_P25,
  ISSF_2026_CFP,
  ISSF_2026_STDP,
]);

export const ISSF_2026_25M_PISTOL_FINAL_RULE_PACKS = Object.freeze([ISSF_2026_RFPM_FINAL, ISSF_2026_P25_FINAL]);

export const ISSF_2026_25M_PISTOL_RULE_PACKS = Object.freeze([
  ...ISSF_2026_25M_PISTOL_QUALIFICATION_RULE_PACKS,
  ...ISSF_2026_25M_PISTOL_FINAL_RULE_PACKS,
]);
