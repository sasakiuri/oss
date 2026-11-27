// SPDX-License-Identifier: MIT
import { defineCommand } from '@/main/shared-infra/cqrs/CommandBus';
import { defineQuery } from '@/main/shared-infra/cqrs/QueryBus';
import type {
  MalfunctionFiringEvidencePayload,
  MalfunctionFiringRequestPayload,
} from '@sasakiuri/saika-protocol/MalfunctionFiring';

import type { FinalFiringIntent } from './IFinalFiringRepository';

/** The live Final series a recovery firing continues, read from the finalist's Lane. */
export interface FinalFiringContext {
  sessionId: string;
  participantId: string;
  rulePackFingerprint: string;
  stageIndex: number;
  seriesIndex: number;
  recordedShots: number;
  seriesShotLimit: number;
}
export interface IFinalFiringAuthorizationSource {
  assertAuthorized(intent: FinalFiringIntent): void;
  prepare(intent: FinalFiringIntent): Promise<MalfunctionFiringRequestPayload>;
}
export interface FinalFiringTransportInput {
  laneId: string;
  request: MalfunctionFiringRequestPayload;
  operation: 'START' | 'READ' | 'CANCEL';
  reason?: string;
}
export const FinalFiringContextToken = defineQuery<{ competitionId: string; laneId: string }, FinalFiringContext>(
  'FinalFiringLiveContext',
);
export const FinalFiringTransportToken = defineCommand<FinalFiringTransportInput, MalfunctionFiringEvidencePayload>(
  'FinalFiringTransport',
);
