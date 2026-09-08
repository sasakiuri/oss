import { defineRulePack, type RulePack, type RuleSeries } from '../RulePack';

import { buildIssfGeneralQualificationMalfunction } from './qualificationMalfunction';

/** Continuous outdoor EST firing, independent of application state machines and hardware. */
export function outdoorQualification(input: {
  eventCode: string;
  displayName: string;
  discipline: string;
  scoringProfileId: string;
  scoringGaugeProfileId: string;
  matchSeconds: number;
  series: readonly RuleSeries[];
  ruleReferences: readonly string[];
}): RulePack {
  return defineRulePack({
    schemaVersion: 1,
    id: `ISSF:2026:${input.eventCode}:QUALIFICATION`,
    eventCode: input.eventCode,
    displayName: input.displayName,
    discipline: input.discipline,
    round: 'QUALIFICATION',
    authority: {
      organization: 'ISSF',
      edition: '2025 Edition (Second Print 07/2026)',
      effectiveFrom: '2026-07-01',
      ruleReferences: ['6.11.1', '6.13', '6.14', '6.15.1', ...input.ruleReferences],
    },
    capabilities: {
      target: {
        scoringProfileId: input.scoringProfileId,
        scoringGaugeProfileId: input.scoringGaugeProfileId,
      },
      scoring: { mode: 'RING', minimumShotScore: 0, maximumSeriesScore: 100, precision: 0 },
      courseOfFire: {
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
            series: input.series,
            timer: { mode: 'stage', durationSeconds: input.matchSeconds },
            requiresNewSession: true,
            seriesTransition: 'AUTOMATIC',
          },
        ],
      },
      ranking: { strategy: 'ISSF_6_15_1_FULL_RING', totalShots: 60, totalSeries: 6 },
      verification: { topIndividualResults: 10, topTeamResultsWhenPublished: 3 },
      publication: { preliminaryRequired: true, scoreProtestWindowSeconds: 600 },
      qualificationMalfunction: buildIssfGeneralQualificationMalfunction(['MATCH']),
      firingWindowReview: {
        rules: [
          {
            id: 'issf.6.11.1.1.h.before-preparation-start',
            kind: 'BEFORE_PREPARATION_AND_SIGHTING_START',
            ruleReference: '6.11.1.1(h)',
            reviewGuidance: 'Review safety disqualification or record the first competition shot as a miss.',
          },
          {
            id: 'issf.6.11.1.1.k.between-phases',
            kind: 'BETWEEN_PREPARATION_AND_SIGHTING_STOP_AND_MATCH_START',
            ruleReference: '6.11.1.1(k)',
            reviewGuidance: 'Exclude the shot from MATCH and review a two-point penalty on the first competition shot.',
          },
          {
            id: 'issf.6.11.1.3.after-match-stop',
            kind: 'AFTER_MATCH_STOP',
            ruleReference: '6.11.1.3',
            reviewGuidance: 'Review shot identification, the required miss and any unidentified best-hit deduction.',
          },
        ],
      },
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
}

/** Only carry a minimum athlete count when the event's rules prescribe it. */
export function outdoorElimination(qualification: RulePack, minimumQualificationAthletes?: number): RulePack {
  return defineRulePack({
    ...qualification,
    id: qualification.id.replace(':QUALIFICATION', ':ELIMINATION:OUTDOOR'),
    eventCode: `${qualification.eventCode}_ELIMINATION`,
    displayName: `${qualification.displayName} — Elimination`,
    round: 'ELIMINATION',
    authority: {
      ...qualification.authority,
      ruleReferences: [...qualification.authority.ruleReferences, '6.6.6.1'],
    },
    capabilities: {
      ...qualification.capabilities,
      outdoorEliminationPlanning: {
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
      },
    },
  });
}
