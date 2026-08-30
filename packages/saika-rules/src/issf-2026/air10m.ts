import { defineRulePack, type RulePack } from '../RulePack';

import { buildIssf10mFinalCommandScript } from './finalCommandScript';

const authority = {
  organization: 'ISSF',
  edition: '2025 Edition (Second Print 07/2026)',
  effectiveFrom: '2026-07-01',
  ruleReferences: ['6.3.3.2', '6.11.1', '6.11.9.1', '6.14', '6.15.1', '6.16.5.1', '6.17.2'],
} as const;

const qualificationCourse = {
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
      series: Array.from({ length: 6 }, () => ({ shots: 10 })),
      timer: { mode: 'stage', durationSeconds: 4500 },
      requiresNewSession: true,
    },
  ],
} as const;

const finalCourse = {
  hasRelays: false,
  minimumParticipants: 2,
  maximumParticipants: 8,
  stages: [
    {
      id: 'PREPARATION_AND_SIGHTING',
      name: 'Preparation and Sighting',
      phase: 'PREPARATION',
      series: [{ shots: 0 }],
      timer: { mode: 'series', durationSeconds: 300 },
      requiresNewSession: false,
    },
    {
      id: 'FIRST_STAGE',
      name: 'First Stage',
      phase: 'MATCH',
      series: [{ shots: 5 }, { shots: 5 }],
      timer: { mode: 'series', durationSeconds: 250 },
      requiresNewSession: true,
    },
    {
      id: 'ELIMINATION_STAGE',
      name: 'Elimination Stage',
      phase: 'MATCH',
      // ISSF 6.17.2: fourteen single shots, each on a separate 50-second command.
      // An elimination checkpoint follows every second single shot.
      series: Array.from({ length: 14 }, () => ({ shots: 1 })),
      timer: { mode: 'shot', durationSeconds: 50 },
      requiresNewSession: false,
      elimination: {
        athletesPerCheckpoint: 1,
        checkpointUnit: 'series',
        checkpointEverySeries: 2,
        tieResolution: 'shoot-off',
      },
    },
  ],
} as const;

const publication = { preliminaryRequired: true, scoreProtestWindowSeconds: 600 } as const;
const verification = { topIndividualResults: 10, topTeamResultsWhenPublished: 3 } as const;
const finalVerification = { topIndividualResults: 10, topTeamResultsWhenPublished: 0 } as const;
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

export const ISSF_2026_AR60: RulePack = defineRulePack({
  schemaVersion: 1,
  id: 'ISSF:2026:AR60:QUALIFICATION',
  eventCode: 'AR60',
  displayName: '10m Air Rifle 60 shots',
  discipline: 'AIR_RIFLE_10M',
  round: 'QUALIFICATION',
  authority,
  capabilities: {
    target: { scoringProfileId: 'ISSF_AIR_RIFLE_10M_2026' },
    scoring: { mode: 'DECIMAL', minimumShotScore: 0, maximumSeriesScore: 109, precision: 1 },
    courseOfFire: qualificationCourse,
    ranking: { strategy: 'ISSF_6_15_1_DECIMAL_RIFLE', totalShots: 60, totalSeries: 6 },
    verification,
    publication,
    firingWindowReview: qualificationFiringWindowReview,
    commands: {
      athleteCallToLineLeadSeconds: 1500,
      sightingTargetVisibilityLeadSeconds: 600,
      setupPeriodSeconds: 600,
      preparationAndSightingSeconds: 900,
      preparationWarningsAtRemainingSeconds: [30],
      matchWarningsAtRemainingSeconds: [600, 300],
      resetPauseSeconds: 30,
    },
  },
});

export const ISSF_2026_AP60: RulePack = defineRulePack({
  schemaVersion: 1,
  id: 'ISSF:2026:AP60:QUALIFICATION',
  eventCode: 'AP60',
  displayName: '10m Air Pistol 60 shots',
  discipline: 'AIR_PISTOL_10M',
  round: 'QUALIFICATION',
  authority,
  capabilities: {
    target: { scoringProfileId: 'ISSF_AIR_PISTOL_10M_2026' },
    scoring: { mode: 'RING', minimumShotScore: 0, maximumSeriesScore: 100, precision: 0 },
    courseOfFire: qualificationCourse,
    ranking: { strategy: 'ISSF_6_15_1_FULL_RING', totalShots: 60, totalSeries: 6 },
    verification,
    publication,
    firingWindowReview: qualificationFiringWindowReview,
    commands: {
      athleteCallToLineLeadSeconds: 1500,
      sightingTargetVisibilityLeadSeconds: 600,
      setupPeriodSeconds: 600,
      preparationAndSightingSeconds: 900,
      preparationWarningsAtRemainingSeconds: [30],
      matchWarningsAtRemainingSeconds: [600, 300],
      resetPauseSeconds: 30,
    },
  },
});

function finalPack(eventCode: 'AR60_FINAL' | 'AP60_FINAL', discipline: string, displayName: string): RulePack {
  const rifle = discipline === 'AIR_RIFLE_10M';
  return defineRulePack({
    schemaVersion: 1,
    id: `ISSF:2026:${eventCode}:FINAL`,
    eventCode,
    displayName,
    discipline,
    round: 'FINAL',
    authority,
    capabilities: {
      target: {
        scoringProfileId: discipline === 'AIR_RIFLE_10M' ? 'ISSF_AIR_RIFLE_10M_2026' : 'ISSF_AIR_PISTOL_10M_2026',
      },
      scoring: { mode: 'DECIMAL', minimumShotScore: 0, maximumSeriesScore: 109, precision: 1 },
      courseOfFire: finalCourse,
      ranking: { strategy: 'FINAL_SCORE', totalShots: 24, totalSeries: 16, stage1Shots: 10 },
      verification: finalVerification,
      commands: {
        preparationAndSightingSeconds: 300,
        preparationWarningsAtRemainingSeconds: [30],
        matchWarningsAtRemainingSeconds: [],
        resetPauseSeconds: 60,
        finalScript: buildIssf10mFinalCommandScript({
          idPrefix: `issf.2026.${eventCode.toLowerCase()}`,
          callToLineLeadSeconds: 600,
          takePositionsLeadSeconds: rifle ? 395 : 375,
          stages: [
            { stageId: 'FIRST_STAGE', stageIndex: 1, shotsPerSeries: 5, seriesCount: 2, durationSeconds: 250 },
            {
              stageId: 'ELIMINATION_STAGE',
              stageIndex: 2,
              shotsPerSeries: 1,
              seriesCount: 14,
              durationSeconds: 50,
              checkpointEverySeries: 2,
            },
          ],
          ruleReferences: {
            reporting: '6.17.1.3',
            callToLine: '6.17.1.14(c)',
            preparation: '6.17.2(d)',
            multiShot: '6.17.2(e)',
            singleShot: '6.17.2(f)',
            checkpoint: '6.17.2(g)-(h)',
            completion: '6.17.2(i)',
            shootOff: '6.17.2(h)',
          },
        }),
      },
    },
  });
}

export const ISSF_2026_AR60_FINAL = finalPack('AR60_FINAL', 'AIR_RIFLE_10M', '10m Air Rifle Final');
export const ISSF_2026_AP60_FINAL = finalPack('AP60_FINAL', 'AIR_PISTOL_10M', '10m Air Pistol Final');

export const ISSF_2026_10M_RULE_PACKS = Object.freeze([
  ISSF_2026_AR60,
  ISSF_2026_AP60,
  ISSF_2026_AR60_FINAL,
  ISSF_2026_AP60_FINAL,
]);
