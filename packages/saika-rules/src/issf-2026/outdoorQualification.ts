import { defineRulePack, type RulePack, type RuleSeries } from '../RulePack';

import {
  ISSF_2026_AUTHORITY,
  outdoorEliminationPlanning,
  PUBLICATION,
  QUALIFICATION_COMMANDS,
  qualificationCourse,
  VERIFICATION,
} from './common';
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
      ...ISSF_2026_AUTHORITY,
      ruleReferences: ['6.11.1', '6.13', '6.14', '6.15.1', ...input.ruleReferences],
    },
    capabilities: {
      target: {
        scoringProfileId: input.scoringProfileId,
        scoringGaugeProfileId: input.scoringGaugeProfileId,
      },
      scoring: { mode: 'RING', minimumShotScore: 0, maximumSeriesScore: 100, precision: 0 },
      courseOfFire: qualificationCourse(input.matchSeconds, input.series),
      ranking: { strategy: 'ISSF_6_15_1_FULL_RING', totalShots: 60, totalSeries: 6 },
      verification: VERIFICATION,
      publication: PUBLICATION,
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
      commands: QUALIFICATION_COMMANDS,
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
      outdoorEliminationPlanning: outdoorEliminationPlanning(minimumQualificationAthletes),
    },
  });
}
