import type {
  QualificationRecoverySettlementEvent,
  QualificationRecoverySettlementRecord,
  QualificationRecoverySettlementRequest,
} from './QualificationRecoverySettlement';

export interface IQualificationRecoverySettlementRepository {
  appendRequest(request: QualificationRecoverySettlementRequest): QualificationRecoverySettlementRequest;
  appendEvent(event: QualificationRecoverySettlementEvent): void;
  findByDecisionId(decisionId: string): QualificationRecoverySettlementRecord | null;
  findByCaseIds(caseIds: readonly string[]): Map<string, QualificationRecoverySettlementRecord[]>;
}
