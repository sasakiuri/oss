// SPDX-License-Identifier: MIT
import { VistaSnapshotSchema, type VistaDefinition } from '@sasakiuri/saika-protocol/Vista';
import { z } from 'zod';

import type { IFinalControlRepository } from '@/main/modules/final-control';
import type { IFinalOperationRepository, projectFinalOperation } from '@/main/modules/final-operations';
import type { IReserveTransferRepository } from '@/main/modules/reserve-lane-transfers';
import type { ResultDisplayProjection } from '@/main/modules/results';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';

// Types shared by the Director Vista source coordinator, its store and its snapshot projector.

export type Competition = MqttControlSnapshotDto['competitions'][number];
export type Lane = MqttControlSnapshotDto['lanes'][number];
export const CanonicalSnapshotSchema = VistaSnapshotSchema.and(
  z.object({ eventRanking: VistaSnapshotSchema.shape.ranking }),
);
export type CanonicalSnapshot = z.infer<typeof CanonicalSnapshotSchema>;
export type CompletedTransfer = ReturnType<IReserveTransferRepository['list']>[number] & {
  sessionId: string;
  athleteId: string;
};
export interface VistaOperations {
  completedTransfers: CompletedTransfer[];
  decisions: ReturnType<IFinalControlRepository['findByCompetition']>;
  shootOff: ReturnType<typeof projectFinalOperation>['shootOff'];
  shootOffShots: ReturnType<IFinalOperationRepository['findShootOffShotsByRun']>;
}
export const missingResetOperations = 'This saved archive lacks operation history at its reset boundary';
/** The saved form of one Vista competition subject (vista_competition_sources.source_json). */
export interface SavedSource {
  upstreamConnected: boolean;
  confirmedLaneIds: string[];
  resetCommandId: string | null;
  sessionHistory: Record<string, string[]>;
  observedSeriesCounts: Record<string, number>;
  shotWindows: Record<string, { after: string | null; before: string | null }>;
  frozenShotIds: string[] | null;
  /** Absent in older saved sources; an archive must not acquire later operations as a substitute. */
  frozenOperations?: VistaOperations | null;
  excludedResultIds: string[];
  competition: Competition;
  lanes: Lane[];
  observedFromStart: string[];
  definition: VistaDefinition | null;
  reason: string | null;
  eventId: string | null;
  eventName: string | null;
  championship: string | null;
  relay: string | null;
}

export type DirectorVistaResultProjection = ResultDisplayProjection;
