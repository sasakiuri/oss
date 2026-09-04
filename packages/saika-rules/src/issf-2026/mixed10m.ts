import { defineRulePack, type RulePack } from '../RulePack';

import { buildIssf10mFinalCommandScript } from './finalCommandScript';
import { buildIssfGeneralQualificationMalfunction } from './qualificationMalfunction';

const authority = {
  organization: 'ISSF',
  edition: '2025 Edition (Second Print 07/2026)',
  effectiveFrom: '2026-07-01',
  ruleReferences: ['6.3.3.3', '6.6.6', '6.11.8', '6.18'],
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
      series: Array.from({ length: 3 }, () => ({ shots: 10 })),
      timer: { mode: 'stage', durationSeconds: 2400 },
      requiresNewSession: true,
    },
  ],
} as const;

const finalCourse = {
  hasRelays: false,
  minimumParticipants: 8,
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
      name: 'Three Five-Shot Series',
      phase: 'MATCH',
      series: Array.from({ length: 3 }, () => ({ shots: 5 })),
      timer: { mode: 'series', durationSeconds: 250 },
      requiresNewSession: true,
    },
    {
      id: 'ELIMINATION_STAGE',
      name: 'Nine Single Shots',
      phase: 'MATCH',
      series: Array.from({ length: 9 }, () => ({ shots: 1 })),
      timer: { mode: 'shot', durationSeconds: 50 },
      requiresNewSession: false,
      // The checkpoints apply to four team aggregates, not eight Lane athletes.
      elimination: {
        athletesPerCheckpoint: 1,
        checkpointUnit: 'series',
        checkpointEverySeries: 3,
        tieResolution: 'shoot-off',
      },
    },
  ],
} as const;

const mixedQualificationFiringWindowReview = {
  rules: [
    {
      id: 'issf.6.18.2.4.d.before-preparation-start',
      kind: 'BEFORE_PREPARATION_AND_SIGHTING_START',
      ruleReference: '6.18.2.4(d)',
      reviewGuidance:
        'Determine whether a safety issue warrants disqualification; otherwise register the first competition shot as a miss.',
    },
    {
      id: 'issf.6.18.2.4.g.between-phases',
      kind: 'BETWEEN_PREPARATION_AND_SIGHTING_STOP_AND_MATCH_START',
      ruleReference: '6.18.2.4(g)',
      reviewGuidance:
        'Do not count this shot as a MATCH shot; apply the same first-competition-shot miss procedure as Rule 6.18.2.4(d).',
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

function mixedQualification(
  eventCode: 'ARMIX30' | 'APMIX30',
  discipline: string,
  displayName: string,
  scoringMode: 'RING' | 'DECIMAL',
): RulePack {
  return defineRulePack({
    schemaVersion: 1,
    id: `ISSF:2026:${eventCode}:QUALIFICATION`,
    eventCode,
    displayName,
    discipline,
    round: 'QUALIFICATION',
    authority,
    capabilities: {
      target: {
        scoringProfileId: discipline === 'AIR_RIFLE_10M' ? 'ISSF_AIR_RIFLE_10M_2026' : 'ISSF_AIR_PISTOL_10M_2026',
        scoringGaugeProfileId: 'ISSF_AIR_4_50_2026',
      },
      scoring: {
        mode: scoringMode,
        minimumShotScore: 0,
        maximumSeriesScore: scoringMode === 'DECIMAL' ? 109 : 100,
        precision: scoringMode === 'DECIMAL' ? 1 : 0,
      },
      courseOfFire: qualificationCourse,
      ranking: {
        strategy: scoringMode === 'DECIMAL' ? 'ISSF_6_15_1_DECIMAL_RIFLE' : 'ISSF_6_15_1_FULL_RING',
        totalShots: 30,
        totalSeries: 3,
      },
      verification: { topIndividualResults: 0, topTeamResultsWhenPublished: 3 },
      team: { format: 'MIXED_PAIR', membersPerTeam: 2, maximumTeamsPerNation: 2, requiredGenders: ['F', 'M'] },
      publication: { preliminaryRequired: true, scoreProtestWindowSeconds: 600 },
      qualificationMalfunction: buildIssfGeneralQualificationMalfunction(['MATCH']),
      firingWindowReview: mixedQualificationFiringWindowReview,
      commands: {
        athleteCallToLineLeadSeconds: 1500,
        setupPeriodSeconds: 600,
        preparationAndSightingSeconds: 900,
        preparationWarningsAtRemainingSeconds: [30],
        matchWarningsAtRemainingSeconds: [],
        resetPauseSeconds: 30,
      },
    },
  });
}

function mixedFinal(eventCode: 'ARMIX_FINAL' | 'APMIX_FINAL', discipline: string, displayName: string): RulePack {
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
        scoringGaugeProfileId: 'ISSF_AIR_4_50_2026',
      },
      scoring: { mode: 'DECIMAL', minimumShotScore: 0, maximumSeriesScore: 109, precision: 1 },
      courseOfFire: finalCourse,
      ranking: {
        strategy: 'FINAL_SCORE',
        totalShots: 24,
        totalSeries: 12,
        stage1Shots: 15,
        finalRuleReference: '6.18.3',
      },
      verification: { topIndividualResults: 0, topTeamResultsWhenPublished: 3 },
      team: { format: 'MIXED_PAIR', membersPerTeam: 2, maximumTeamsPerNation: 2, requiredGenders: ['F', 'M'] },
      commands: {
        preparationAndSightingSeconds: 300,
        preparationWarningsAtRemainingSeconds: [30],
        matchWarningsAtRemainingSeconds: [],
        resetPauseSeconds: 60,
        finalScript: buildIssf10mFinalCommandScript({
          idPrefix: `issf.2026.${eventCode.toLowerCase()}`,
          callToLineLeadSeconds: 510,
          takePositionsLeadSeconds: rifle ? 395 : 375,
          stages: [
            { stageId: 'FIRST_STAGE', stageIndex: 1, shotsPerSeries: 5, seriesCount: 3, durationSeconds: 250 },
            {
              stageId: 'ELIMINATION_STAGE',
              stageIndex: 2,
              shotsPerSeries: 1,
              seriesCount: 9,
              durationSeconds: 50,
              checkpointEverySeries: 3,
            },
          ],
          ruleReferences: {
            reporting: '6.18.3.4',
            callToLine: '6.18.3.8',
            preparation: '6.18.3.9',
            multiShot: '6.18.4(b)-(g)',
            singleShot: '6.18.4(h)',
            checkpoint: '6.18.3.6, 6.18.4(h)',
            completion: '6.18.4.2',
            shootOff: '6.18.3.6',
          },
        }),
      },
    },
  });
}

export const ISSF_2026_ARMIX30 = mixedQualification(
  'ARMIX30',
  'AIR_RIFLE_10M',
  '10m Air Rifle Mixed Team Qualification',
  'DECIMAL',
);
export const ISSF_2026_APMIX30 = mixedQualification(
  'APMIX30',
  'AIR_PISTOL_10M',
  '10m Air Pistol Mixed Team Qualification',
  'RING',
);
export const ISSF_2026_ARMIX_FINAL = mixedFinal('ARMIX_FINAL', 'AIR_RIFLE_10M', '10m Air Rifle Mixed Team Final');
export const ISSF_2026_APMIX_FINAL = mixedFinal('APMIX_FINAL', 'AIR_PISTOL_10M', '10m Air Pistol Mixed Team Final');

export const ISSF_2026_10M_MIXED_RULE_PACKS = Object.freeze([
  ISSF_2026_ARMIX30,
  ISSF_2026_APMIX30,
  ISSF_2026_ARMIX_FINAL,
  ISSF_2026_APMIX_FINAL,
]);
