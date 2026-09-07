import type { EstComplaintCapability, EstComplaintProcedure, RuleEstComplaintIssue } from '../EstComplaint';

const issues: readonly RuleEstComplaintIssue[] = [
  'SHOT_VALUE',
  'SHOT_NOT_REGISTERED',
  'TARGET_FAILURE',
  'TARGET_MEDIA_ADVANCE',
  'OTHER',
];

export const ISSF_2026_FINAL_EST_COMPLAINTS: EstComplaintCapability = {
  procedures: (['SIGHTING', 'MATCH'] as const).flatMap((phase) =>
    issues.map((issue): EstComplaintProcedure => {
      if (issue === 'SHOT_VALUE')
        return {
          phase,
          issue,
          review: 'OFFICIAL_REVIEW',
          ruleReference: '6.17.1.7',
          athleteGuidance:
            'Score protests about shot values or the number of shots are not permitted in Finals. Report a missing shot or target malfunction as an EST complaint.',
          officialGuidance:
            'Preserve the observation without opening a score-value protest. Confirm whether the athlete is reporting an EST malfunction under 6.17.1.8.',
        };
      if (issue === 'OTHER')
        return {
          phase,
          issue,
          review: 'OFFICIAL_REVIEW',
          ruleReference: '6.17.1.13',
          athleteGuidance:
            'Notify the Range Officer immediately of a Final protest. The Jury decides the applicable procedure.',
          officialGuidance:
            'Use the immediate Final protest procedure where applicable; do not apply the Qualification score-protest window. The Final Protest Jury decision is final.',
        };
      return {
        phase,
        issue,
        review: 'FINAL_EST_COMPLAINT',
        ruleReference: phase === 'SIGHTING' ? '6.17.1.8(a)' : '6.17.1.8(b)-(d)',
        athleteGuidance:
          'Notify the Range Officer of the target problem. Fire a test or replacement shot only when directed under the Final EST procedure.',
        officialGuidance:
          phase === 'SIGHTING'
            ? 'Apply the Final sighting EST procedure. A missing shot requires a directed test shot; another failure or a paper/rubber strip failure requires STOP/UNLOAD for all finalists and a reserve target. Give two minutes preparation before restarting Preparation and Sighting.'
            : 'The Jury Member-in-Charge, another Competition Jury member and an RTS determine miss versus target failure. Use the event-specific Final recovery procedure for replacement firing and reserve targets; keep the ruling and score settlement separate.',
      };
    }),
  ),
};
