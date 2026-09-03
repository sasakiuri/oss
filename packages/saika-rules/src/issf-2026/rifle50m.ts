import { defineRulePack, type RulePack, type RuleSeries } from '../RulePack';

import { buildIssf50mThreePositionsFinalCommandScript } from './rifle50mFinalCommandScript';

const authority = {
  organization: 'ISSF',
  edition: '2025 Edition (Second Print 07/2026)',
  effectiveFrom: '2026-07-01',
  ruleReferences: ['6.3.3.2', '6.11.1', '6.11.9.2', '6.11.9.3', '6.14', '6.15.1', '6.17.3', '7.7'],
} as const;

const publication = { preliminaryRequired: true, scoreProtestWindowSeconds: 600 } as const;
const verification = { topIndividualResults: 10, topTeamResultsWhenPublished: 3 } as const;
const outdoorEliminationPlanning = {
  venue: 'OUTDOOR',
  requiredWhenEntriesExceedUsableCapacity: true,
  waiverAuthority: 'TECHNICAL_DELEGATE',
  waiverReason: 'SCHEDULE_LIMITATIONS',
  completeCourseOfFire: true,
  randomSquadding: true,
  quotaMethod: 'PROPORTIONAL_RELAY_STARTS',
  balanceTeamsAndNationsAcrossRelays: true,
  minimumQualificationAthletes: 12,
  preferredDaysBeforeQualification: 1,
} as const;
const qualificationFiringWindowReview = {
  rules: [
    {
      id: 'issf.6.11.1.1.h.before-preparation-start',
      kind: 'BEFORE_PREPARATION_AND_SIGHTING_START',
      ruleReference: '6.11.1.1(h)',
      reviewGuidance:
        'Determine whether a safety issue warrants disqualification; otherwise register the first competition shot as a miss.',
    },
    {
      id: 'issf.6.11.1.1.k.between-phases',
      kind: 'BETWEEN_PREPARATION_AND_SIGHTING_STOP_AND_MATCH_START',
      ruleReference: '6.11.1.1(k)',
      reviewGuidance:
        'Do not count this shot as a MATCH shot; review the two-point penalty on the first competition shot.',
    },
    {
      id: 'issf.6.11.1.3.after-match-stop',
      kind: 'AFTER_MATCH_STOP',
      ruleReference: '6.11.1.3',
      reviewGuidance:
        'Review shot identification, the required miss, and any best-hit deduction when the shot cannot be identified.',
    },
  ],
} as const;

const threePositionSeries: readonly RuleSeries[] = [
  { shots: 10, label: 'Kneeling 1', position: 'KNEELING' },
  { shots: 10, label: 'Kneeling 2', position: 'KNEELING' },
  { shots: 10, label: 'Prone 1', position: 'PRONE', targetModeControl: 'ATHLETE' },
  { shots: 10, label: 'Prone 2', position: 'PRONE' },
  { shots: 10, label: 'Standing 1', position: 'STANDING', targetModeControl: 'ATHLETE' },
  { shots: 10, label: 'Standing 2', position: 'STANDING' },
];

function qualificationCourse(matchSeconds: number, series: readonly RuleSeries[]) {
  return {
    hasRelays: true,
    stages: [
      {
        id: 'PREPARATION_AND_SIGHTING',
        name: 'Preparation and Sighting',
        phase: 'PREPARATION',
        series: [{ shots: 0 }],
        timer: { mode: 'stage', durationSeconds: 900 },
        requiresNewSession: false,
      },
      {
        id: 'MATCH',
        name: 'Match',
        phase: 'MATCH',
        series,
        timer: { mode: 'stage', durationSeconds: matchSeconds },
        requiresNewSession: true,
        seriesTransition: 'AUTOMATIC',
      },
    ],
  } as const;
}

function qualificationCommands(matchWarningsAtRemainingSeconds: readonly number[]) {
  return {
    athleteCallToLineLeadSeconds: 1500,
    sightingTargetVisibilityLeadSeconds: 600,
    setupPeriodSeconds: 600,
    preparationAndSightingSeconds: 900,
    preparationWarningsAtRemainingSeconds: [30],
    matchWarningsAtRemainingSeconds,
    resetPauseSeconds: 30,
  } as const;
}

function threePositionsQualification(input: {
  eventCode: string;
  id: string;
  displayName: string;
  matchSeconds: number;
}): RulePack {
  return defineRulePack({
    schemaVersion: 1,
    id: input.id,
    eventCode: input.eventCode,
    displayName: input.displayName,
    discipline: 'RIFLE_50M',
    round: 'QUALIFICATION',
    authority,
    capabilities: {
      target: {
        scoringProfileId: 'ISSF_RIFLE_50M_2026',
        scoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
      },
      scoring: { mode: 'RING', minimumShotScore: 0, maximumSeriesScore: 100, precision: 0 },
      courseOfFire: qualificationCourse(input.matchSeconds, threePositionSeries),
      ranking: { strategy: 'ISSF_6_15_1_FULL_RING', totalShots: 60, totalSeries: 6 },
      verification,
      publication,
      firingWindowReview: qualificationFiringWindowReview,
      commands: qualificationCommands([600, 300]),
    },
  });
}

/** ISSF 6.11.9.2 outdoor 50m range timing: 105 minutes. */
export const ISSF_2026_R3P60 = threePositionsQualification({
  eventCode: 'R3P60',
  id: 'ISSF:2026:R3P60:QUALIFICATION:OUTDOOR',
  displayName: '50m Rifle 3 Positions 60 shots (Outdoor)',
  matchSeconds: 6300,
});

/** Explicit operational variant for the 90-minute indoor time stated in ISSF 6.11.9.2. */
export const ISSF_2026_R3P60_INDOOR = threePositionsQualification({
  eventCode: 'R3P60_INDOOR',
  id: 'ISSF:2026:R3P60:QUALIFICATION:INDOOR',
  displayName: '50m Rifle 3 Positions 60 shots (Indoor)',
  matchSeconds: 5400,
});

/** ISSF 6.6.6.1 / 6.11.9.2 full-course outdoor Elimination. */
export const ISSF_2026_R3P60_ELIMINATION: RulePack = defineRulePack({
  ...ISSF_2026_R3P60,
  id: 'ISSF:2026:R3P60:ELIMINATION:OUTDOOR',
  eventCode: 'R3P60_ELIMINATION',
  displayName: '50m Rifle 3 Positions 60 shots (Outdoor Elimination)',
  round: 'ELIMINATION',
  authority: {
    ...authority,
    ruleReferences: [...authority.ruleReferences, '6.6.6.1'],
  },
  capabilities: {
    ...ISSF_2026_R3P60.capabilities,
    outdoorEliminationPlanning,
  },
});

export const ISSF_2026_RPR60: RulePack = defineRulePack({
  schemaVersion: 1,
  id: 'ISSF:2026:RPR60:QUALIFICATION',
  eventCode: 'RPR60',
  displayName: '50m Rifle Prone 60 shots',
  discipline: 'RIFLE_50M',
  round: 'QUALIFICATION',
  authority,
  capabilities: {
    target: {
      scoringProfileId: 'ISSF_RIFLE_50M_2026',
      scoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
    },
    scoring: { mode: 'DECIMAL', minimumShotScore: 0, maximumSeriesScore: 109, precision: 1 },
    courseOfFire: qualificationCourse(
      3000,
      Array.from({ length: 6 }, (_, index) => ({
        shots: 10,
        label: `Prone ${index + 1}`,
        position: 'PRONE' as const,
      })),
    ),
    ranking: { strategy: 'ISSF_6_15_1_DECIMAL_RIFLE', totalShots: 60, totalSeries: 6 },
    verification,
    publication,
    firingWindowReview: qualificationFiringWindowReview,
    commands: qualificationCommands([600, 300]),
  },
});

/** ISSF 6.6.6.1 / 6.11.9.3 full-course outdoor Elimination. */
export const ISSF_2026_RPR60_ELIMINATION: RulePack = defineRulePack({
  ...ISSF_2026_RPR60,
  id: 'ISSF:2026:RPR60:ELIMINATION:OUTDOOR',
  eventCode: 'RPR60_ELIMINATION',
  displayName: '50m Rifle Prone 60 shots (Outdoor Elimination)',
  round: 'ELIMINATION',
  authority: {
    ...authority,
    ruleReferences: [...authority.ruleReferences, '6.6.6.1'],
  },
  capabilities: {
    ...ISSF_2026_RPR60.capabilities,
    outdoorEliminationPlanning,
  },
});

export const ISSF_2026_R3P_FINAL: RulePack = defineRulePack({
  schemaVersion: 1,
  id: 'ISSF:2026:R3P35:FINAL',
  eventCode: 'R3P_FINAL',
  displayName: '50m Rifle 3 Positions Final',
  discipline: 'RIFLE_50M',
  round: 'FINAL',
  authority,
  capabilities: {
    target: {
      scoringProfileId: 'ISSF_RIFLE_50M_2026',
      scoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
    },
    scoring: { mode: 'DECIMAL', minimumShotScore: 0, maximumSeriesScore: 109, precision: 1 },
    courseOfFire: {
      hasRelays: false,
      minimumParticipants: 2,
      maximumParticipants: 8,
      stages: [
        {
          id: 'PREPARATION_AND_SIGHTING',
          name: 'Kneeling Preparation and Sighting',
          phase: 'PREPARATION',
          series: [{ shots: 0, label: 'Kneeling sighting', position: 'KNEELING' }],
          timer: { mode: 'series', durationSeconds: 300 },
          requiresNewSession: false,
        },
        {
          id: 'KNEELING_PRONE_CHANGEOVER',
          name: 'Kneeling, Prone and Standing Changeover',
          phase: 'MATCH',
          series: [
            { shots: 10, label: 'Kneeling', position: 'KNEELING' },
            { shots: 10, label: 'Prone', position: 'PRONE', targetModeControl: 'ATHLETE' },
            {
              shots: 0,
              label: 'Standing changeover and sighting',
              position: 'STANDING',
              purpose: 'POSITION_CHANGE_AND_SIGHTING',
              targetModeControl: 'ATHLETE',
            },
          ],
          timer: { mode: 'stage', durationSeconds: 1320 },
          requiresNewSession: true,
          seriesTransition: 'AUTOMATIC',
        },
        {
          id: 'STANDING_SERIES',
          name: 'Standing Five-Shot Series',
          phase: 'MATCH',
          series: [
            { shots: 5, label: 'Standing series 1', position: 'STANDING' },
            { shots: 5, label: 'Standing series 2', position: 'STANDING' },
          ],
          timer: { mode: 'series', durationSeconds: 250 },
          requiresNewSession: false,
          seriesTransition: 'OFFICIAL_COMMAND',
        },
        {
          id: 'STANDING_SINGLE_SHOTS',
          name: 'Standing Single-Shot Eliminations',
          phase: 'MATCH',
          series: Array.from({ length: 5 }, (_, index) => ({
            shots: 1,
            label: `Standing shot ${31 + index}`,
            position: 'STANDING' as const,
          })),
          timer: { mode: 'shot', durationSeconds: 50 },
          requiresNewSession: false,
          seriesTransition: 'OFFICIAL_COMMAND',
          elimination: {
            athletesPerCheckpoint: 1,
            checkpointUnit: 'series',
            checkpointEverySeries: 1,
            tieResolution: 'shoot-off',
          },
        },
      ],
    },
    ranking: {
      strategy: 'FINAL_SCORE',
      totalShots: 35,
      totalSeries: 9,
      stage1Shots: 30,
      finalRuleReference: '6.17.3',
      finalCheckpoints: [
        {
          afterMatchShot: 30,
          rank: 8,
          tieResolution: {
            type: 'COUNTBACK_FOR_EXACT_TIE',
            athleteCount: 2,
            criteria: [
              { type: 'SERIES_TOTAL', stageId: 'STANDING_SERIES', seriesIndex: 1 },
              { type: 'SERIES_TOTAL', stageId: 'STANDING_SERIES', seriesIndex: 0 },
              { type: 'REVERSE_SHOTS', stageId: 'KNEELING_PRONE_CHANGEOVER', seriesIndex: 1 },
              { type: 'REVERSE_SHOTS', stageId: 'KNEELING_PRONE_CHANGEOVER', seriesIndex: 0 },
            ],
            otherwise: 'SHOOT_OFF',
          },
        },
        { afterMatchShot: 30, rank: 7 },
        { afterMatchShot: 31, rank: 6 },
        { afterMatchShot: 32, rank: 5 },
        { afterMatchShot: 33, rank: 4 },
        { afterMatchShot: 34, rank: 3 },
        { afterMatchShot: 35, rank: 2 },
      ],
    },
    verification: { topIndividualResults: 10, topTeamResultsWhenPublished: 0 },
    commands: {
      athleteCallToLineLeadSeconds: 600,
      setupPeriodSeconds: 1200,
      preparationAndSightingSeconds: 300,
      preparationWarningsAtRemainingSeconds: [30],
      matchWarningsAtRemainingSeconds: [],
      resetPauseSeconds: 60,
      finalScript: buildIssf50mThreePositionsFinalCommandScript(),
    },
  },
});

export const ISSF_2026_50M_RIFLE_RULE_PACKS = Object.freeze([
  ISSF_2026_R3P60_ELIMINATION,
  ISSF_2026_R3P60,
  ISSF_2026_R3P60_INDOOR,
  ISSF_2026_RPR60_ELIMINATION,
  ISSF_2026_RPR60,
  ISSF_2026_R3P_FINAL,
]);
