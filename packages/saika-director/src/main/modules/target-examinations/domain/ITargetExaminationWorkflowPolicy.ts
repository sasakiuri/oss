import type { TargetExaminationCase } from './TargetExaminationCase';
import type { TargetExaminationEntry } from './TargetExaminationEntry';
import type { TargetExaminationEvidence } from './TargetExaminationEvidence';

export type TargetExaminationWorkflowStepStatus = 'COMPLETE' | 'MISSING' | 'MANUAL_CONFIRMATION';

export interface TargetExaminationWorkflowStep {
  readonly id: string;
  readonly label: string;
  readonly ruleReference: string;
  readonly status: TargetExaminationWorkflowStepStatus;
  readonly guidance: string;
}

export interface TargetExaminationWorkflowAssessment {
  readonly policyId: string;
  readonly advisoryOnly: true;
  readonly readyForJuryDecision: boolean;
  readonly steps: readonly TargetExaminationWorkflowStep[];
}

/**
 * A replaceable advisory policy. It never changes a score,
 * releases evidence, or substitutes for a Jury decision.
 */
export interface ITargetExaminationWorkflowPolicy {
  evaluate(
    examination: TargetExaminationCase,
    evidence: readonly TargetExaminationEvidence[],
    entries: readonly TargetExaminationEntry[],
  ): TargetExaminationWorkflowAssessment;
}
