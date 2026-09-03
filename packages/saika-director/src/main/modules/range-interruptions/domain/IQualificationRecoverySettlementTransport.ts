import { defineCommand } from '@/main/shared-infra/cqrs/CommandBus';

import type { QualificationRecoveryCommandResult } from './QualificationRecoveryExecution';

export interface ApplyQualificationRecoverySettlementTransportInput {
  readonly competitionId: string;
  readonly laneId: string;
  readonly decisionId: string;
  readonly interruptionId: string;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly expectedMatchProgramId: string;
  readonly expectedSeriesShotLimit: number;
  readonly expectedRecordedShots: number;
  readonly treatment: 'KEEP_RECORDED_SERIES';
  readonly decisionOfficialName: string;
  readonly decisionRuleReference: string;
  readonly decidedAt: string;
  readonly appliedBy: string;
  readonly statement: string;
  readonly appliedAt: string;
}

export interface IQualificationRecoverySettlementTransport {
  apply(input: ApplyQualificationRecoverySettlementTransportInput): Promise<QualificationRecoveryCommandResult>;
}

export const ApplyQualificationRecoverySettlementTransportToken = defineCommand<
  ApplyQualificationRecoverySettlementTransportInput,
  QualificationRecoveryCommandResult
>('mqtt.settleQualificationRecovery');
