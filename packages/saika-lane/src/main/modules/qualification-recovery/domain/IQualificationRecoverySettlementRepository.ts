// SPDX-License-Identifier: MIT
import type { QualificationRecoverySettlementRecord } from './QualificationRecoverySettlement';

export interface IQualificationRecoverySettlementRepository {
  append(settlement: QualificationRecoverySettlementRecord): QualificationRecoverySettlementRecord;
  findByDecisionId(decisionId: string): QualificationRecoverySettlementRecord | null;
}
