import type { QualificationMalfunctionCapability, RulePackIdentity } from '@sasakiuri/saika-rules';

export interface QualificationMalfunctionPolicyContext {
  readonly competitionTypeId: string;
  readonly rulePackIdentity: RulePackIdentity | null;
  readonly capability: QualificationMalfunctionCapability;
  readonly phase: 'SIGHTING' | 'MATCH';
  readonly stageId: string | null;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly seriesShotLimit: number | null;
  readonly timedTargetProgramId: string | null;
}

export interface IQualificationMalfunctionPolicyResolver {
  resolve(input: { eventId: string; stageIndex: number; seriesIndex: number }): QualificationMalfunctionPolicyContext;
}
