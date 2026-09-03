// SPDX-License-Identifier: MIT
import type { QualificationRecoveryAdjudicationRecord } from './QualificationRecoveryAdjudication';

export interface IQualificationRecoveryAdjudicationRepository {
  append(adjudication: QualificationRecoveryAdjudicationRecord): QualificationRecoveryAdjudicationRecord;
  findByRunId(runId: string): QualificationRecoveryAdjudicationRecord | null;
}
