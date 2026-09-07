import type { CompetitionRound } from './RulePack';
import type { RulePackIdentity } from './RulePackIdentity';

export type RuleEstComplaintIssue =
  'SHOT_VALUE' | 'SHOT_NOT_REGISTERED' | 'TARGET_FAILURE' | 'TARGET_MEDIA_ADVANCE' | 'OTHER';

/** Procedure metadata only. It never grants firing, decides a protest or changes a score. */
export interface EstComplaintProcedure {
  readonly phase: 'SIGHTING' | 'MATCH';
  readonly issue: RuleEstComplaintIssue;
  readonly review: 'SCORE_PROTEST' | 'EST_COMPLAINT' | 'FINAL_EST_COMPLAINT' | 'OFFICIAL_REVIEW';
  readonly ruleReference: string;
  readonly athleteGuidance: string;
  readonly officialGuidance: string;
}

export interface EstComplaintCapability {
  readonly procedures: readonly EstComplaintProcedure[];
}

export interface EstComplaintRuleContext extends EstComplaintCapability {
  readonly round: CompetitionRound;
  readonly identity: RulePackIdentity;
}

export function findEstComplaintProcedure(
  capability: EstComplaintCapability | undefined,
  phase: 'SIGHTING' | 'MATCH',
  issue: RuleEstComplaintIssue,
): EstComplaintProcedure | undefined {
  return capability?.procedures.find((procedure) => procedure.phase === phase && procedure.issue === issue);
}

export function validateEstComplaintCapability(capability: EstComplaintCapability): void {
  const keys = new Set<string>();
  for (const procedure of capability.procedures) {
    const key = `${procedure.phase}:${procedure.issue}`;
    if (keys.has(key)) throw new Error(`Duplicate EST complaint procedure: ${key}`);
    keys.add(key);
    if (
      !['SIGHTING', 'MATCH'].includes(procedure.phase) ||
      !['SHOT_VALUE', 'SHOT_NOT_REGISTERED', 'TARGET_FAILURE', 'TARGET_MEDIA_ADVANCE', 'OTHER'].includes(
        procedure.issue,
      ) ||
      !['SCORE_PROTEST', 'EST_COMPLAINT', 'FINAL_EST_COMPLAINT', 'OFFICIAL_REVIEW'].includes(procedure.review)
    )
      throw new Error(`Invalid EST complaint procedure: ${key}`);
    for (const text of [procedure.ruleReference, procedure.athleteGuidance, procedure.officialGuidance]) {
      if (!text.trim()) throw new Error(`EST complaint procedure ${key} requires references and guidance`);
    }
  }
}
