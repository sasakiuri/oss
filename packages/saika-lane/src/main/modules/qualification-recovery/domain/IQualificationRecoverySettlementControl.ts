// SPDX-License-Identifier: MIT
import type {
  QualificationRecoverySettlementRecord,
  QualificationRecoverySettlementRequest,
} from './QualificationRecoverySettlement';

export type ApplyQualificationRecoverySettlementInput = Omit<QualificationRecoverySettlementRequest, 'appliedAt'> & {
  readonly appliedAt?: Date;
};

export interface IQualificationRecoverySettlementControl {
  apply(input: ApplyQualificationRecoverySettlementInput): Promise<QualificationRecoverySettlementRecord>;
  get(decisionId: string): QualificationRecoverySettlementRecord | null;
}
