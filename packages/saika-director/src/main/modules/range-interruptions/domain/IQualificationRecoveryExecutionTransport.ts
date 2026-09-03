import type { QualificationRecoveryFiringAuthorizationPayload } from '@/shared/mqtt';
import { defineCommand } from '@/main/shared-infra/cqrs/CommandBus';

import type { QualificationRecoveryCommandResult } from './QualificationRecoveryExecution';

export interface StartQualificationRecoveryTransportInput {
  readonly competitionId: string;
  readonly laneId: string;
  readonly runId: string;
  readonly decisionId: string;
  readonly interruptionId: string;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly expectedMatchProgramId: string;
  readonly expectedSeriesShotLimit: number;
  readonly expectedRecordedShots: number;
  readonly authorization: QualificationRecoveryFiringAuthorizationPayload;
  readonly officialName: string;
  readonly decisionRuleReference: string;
  readonly decidedAt: string;
}

export interface CancelQualificationRecoveryTransportInput {
  readonly competitionId: string;
  readonly laneId: string;
  readonly runId: string;
  readonly reason: string;
}

export interface ApplyQualificationRecoveryTransportInput {
  readonly competitionId: string;
  readonly laneId: string;
  readonly runId: string;
  readonly appliedBy: string;
  readonly statement: string;
  readonly appliedAt: string;
}

export interface IQualificationRecoveryExecutionTransport {
  start(input: StartQualificationRecoveryTransportInput): Promise<QualificationRecoveryCommandResult>;
  cancel(input: CancelQualificationRecoveryTransportInput): Promise<QualificationRecoveryCommandResult>;
  apply(input: ApplyQualificationRecoveryTransportInput): Promise<QualificationRecoveryCommandResult>;
}

export const StartQualificationRecoveryTransportToken = defineCommand<
  StartQualificationRecoveryTransportInput,
  QualificationRecoveryCommandResult
>('mqtt.startQualificationRecovery');

export const CancelQualificationRecoveryTransportToken = defineCommand<
  CancelQualificationRecoveryTransportInput,
  QualificationRecoveryCommandResult
>('mqtt.cancelQualificationRecovery');

export const ApplyQualificationRecoveryTransportToken = defineCommand<
  ApplyQualificationRecoveryTransportInput,
  QualificationRecoveryCommandResult
>('mqtt.applyQualificationRecovery');
