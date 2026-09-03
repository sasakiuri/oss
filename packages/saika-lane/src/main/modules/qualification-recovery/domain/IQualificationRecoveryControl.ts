// SPDX-License-Identifier: MIT
import type { QualificationRecoveryRunRecord, StartQualificationRecoveryRunInput } from './QualificationRecoveryRun';

export interface IQualificationRecoveryControl {
  start(input: StartQualificationRecoveryRunInput): Promise<QualificationRecoveryRunRecord>;
  cancel(input: { runId: string; reason: string; cancelledAt?: Date }): QualificationRecoveryRunRecord;
  get(runId: string): QualificationRecoveryRunRecord | null;
  getLatest(competitionId?: string): QualificationRecoveryRunRecord | null;
  restoreActive(): QualificationRecoveryRunRecord | null;
}
