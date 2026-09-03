// SPDX-License-Identifier: MIT
import type {
  QualificationRecoveryRecordedShot,
  QualificationRecoveryRunRecord,
  QualificationRecoveryRunStart,
  QualificationRecoveryRunStatus,
} from './QualificationRecoveryRun';

export interface IQualificationRecoveryRepository {
  appendStarted(start: QualificationRecoveryRunStart): void;
  appendShot(runId: string, shot: QualificationRecoveryRecordedShot): void;
  appendTerminal(input: {
    runId: string;
    status: Exclude<QualificationRecoveryRunStatus, 'RUNNING'>;
    reason: string;
    occurredAt: Date;
    recordedAt: Date;
  }): void;
  findByRunId(runId: string): QualificationRecoveryRunRecord | null;
  findLatest(competitionId?: string): QualificationRecoveryRunRecord | null;
}
