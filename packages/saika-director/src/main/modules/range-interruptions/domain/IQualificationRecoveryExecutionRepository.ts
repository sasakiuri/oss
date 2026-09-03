import type {
  QualificationRecoveryExecutionEvent,
  QualificationRecoveryExecutionPhase,
  QualificationRecoveryExecutionRecord,
  QualificationRecoveryExecutionStart,
} from './QualificationRecoveryExecution';

export interface IQualificationRecoveryExecutionRepository {
  appendStart(start: QualificationRecoveryExecutionStart): QualificationRecoveryExecutionStart;
  appendEvent(event: QualificationRecoveryExecutionEvent): void;
  findByRunId(runId: string): QualificationRecoveryExecutionRecord | null;
  findByDecisionPhase(
    decisionId: string,
    phase: QualificationRecoveryExecutionPhase,
  ): QualificationRecoveryExecutionRecord | null;
  findByCaseIds(caseIds: readonly string[]): Map<string, QualificationRecoveryExecutionRecord[]>;
}
