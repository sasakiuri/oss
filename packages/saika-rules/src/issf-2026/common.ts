import type { RuleSeries } from '../RulePack';

export const ISSF_2026_AUTHORITY = {
  organization: 'ISSF',
  edition: '2025 Edition (Second Print 07/2026)',
  effectiveFrom: '2026-07-01',
} as const;

export const PUBLICATION = { preliminaryRequired: true, scoreProtestWindowSeconds: 600 } as const;
export const VERIFICATION = { topIndividualResults: 10, topTeamResultsWhenPublished: 3 } as const;
export const FINAL_VERIFICATION = { topIndividualResults: 10, topTeamResultsWhenPublished: 0 } as const;

export const QUALIFICATION_COMMANDS = {
  athleteCallToLineLeadSeconds: 1500,
  sightingTargetVisibilityLeadSeconds: 600,
  setupPeriodSeconds: 600,
  preparationAndSightingSeconds: 900,
  preparationWarningsAtRemainingSeconds: [30],
  matchWarningsAtRemainingSeconds: [600, 300],
  resetPauseSeconds: 30,
} as const;

export const QUALIFICATION_FIRING_WINDOW_REVIEW = {
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

export const THREE_POSITION_SERIES: readonly RuleSeries[] = [
  { shots: 10, label: 'Kneeling 1', position: 'KNEELING' },
  { shots: 10, label: 'Kneeling 2', position: 'KNEELING' },
  { shots: 10, label: 'Prone 1', position: 'PRONE', targetModeControl: 'ATHLETE' },
  { shots: 10, label: 'Prone 2', position: 'PRONE' },
  { shots: 10, label: 'Standing 1', position: 'STANDING', targetModeControl: 'ATHLETE' },
  { shots: 10, label: 'Standing 2', position: 'STANDING' },
];

export function qualificationCourse(matchSeconds: number, series: readonly RuleSeries[]) {
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

export function outdoorEliminationPlanning(minimumQualificationAthletes?: number) {
  return {
    venue: 'OUTDOOR',
    requiredWhenEntriesExceedUsableCapacity: true,
    waiverAuthority: 'TECHNICAL_DELEGATE',
    waiverReason: 'SCHEDULE_LIMITATIONS',
    completeCourseOfFire: true,
    randomSquadding: true,
    quotaMethod: 'PROPORTIONAL_RELAY_STARTS',
    balanceTeamsAndNationsAcrossRelays: true,
    ...(minimumQualificationAthletes === undefined ? {} : { minimumQualificationAthletes }),
    preferredDaysBeforeQualification: 1,
  } as const;
}
