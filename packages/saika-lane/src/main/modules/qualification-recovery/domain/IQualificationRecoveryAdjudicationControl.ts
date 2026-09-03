// SPDX-License-Identifier: MIT
import type { QualificationRecoveryAdjudicationRecord } from './QualificationRecoveryAdjudication';

export interface ApplyQualificationRecoveryAdjudicationInput {
  readonly runId: string;
  readonly competitionId: string;
  readonly appliedBy: string;
  readonly statement: string;
  readonly appliedAt?: Date;
}

export interface IQualificationRecoveryAdjudicationControl {
  apply(input: ApplyQualificationRecoveryAdjudicationInput): Promise<QualificationRecoveryAdjudicationRecord>;
  get(runId: string): QualificationRecoveryAdjudicationRecord | null;
}
