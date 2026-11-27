// SPDX-License-Identifier: MIT
import {
  ReserveLaneTransferActionSchema,
  ReserveLaneTransferBundleSchema,
  type ReserveLaneTransferAction,
  type ReserveLaneTransferBundle,
} from '@sasakiuri/saika-protocol/ReserveLaneTransfer';

import type { CompetitionStateRegistry } from './CompetitionStateRegistry';
import type { DirectorCommandPort } from './DirectorCommandPort';

export type ReserveLaneTransferContext = Pick<
  CompetitionStateRegistry,
  'requireCompetitionPhase' | 'requireCompetitionLane' | 'getLane' | 'retainCompetitionState'
>;

/** Moves a competitor's Lane state to a reserve Lane, one Lane-addressed step at a time. */
export class ReserveLaneTransferCommands {
  constructor(
    private readonly commands: DirectorCommandPort,
    private readonly context: ReserveLaneTransferContext,
  ) {}

  async transferReserveLane(input: {
    competitionId: string;
    laneId: string;
    transfer: ReserveLaneTransferAction;
  }): Promise<ReserveLaneTransferBundle> {
    const competition = this.context.requireCompetitionPhase(
      input.competitionId,
      'MATCH',
      'transfer to a reserve Lane',
    );
    if (competition.roundName === 'Final')
      throw new Error('Final state transfer requires a separate recovery protocol');
    this.context.requireCompetitionLane(input.competitionId, input.laneId);
    if (
      !['CANCEL_SOURCE', 'CANCEL_TARGET'].includes(input.transfer.operation) &&
      this.context.getLane(input.laneId)?.safetyState?.status !== 'STOPPED'
    )
      throw new Error('Apply and retain the Lane safety STOP during transfer');
    const transfer = ReserveLaneTransferActionSchema.parse(input.transfer);
    const command = this.commands.commandBase({ transfer });
    const result = await this.commands.publishCompetitionLaneCommand(
      input.competitionId,
      input.laneId,
      'reserve-lane-transfer',
      command,
    );
    const response = result.lanes.find((lane) => lane.laneId === input.laneId);
    if (!result.success || response?.status !== 'done')
      throw new Error(response?.error?.message ?? 'Reserve transfer was not acknowledged; retry the same transfer');
    const bundle = ReserveLaneTransferBundleSchema.parse(response.data?.bundle);
    const expectedId =
      transfer.operation === 'PREPARE_SOURCE'
        ? transfer.request.id
        : 'bundle' in transfer
          ? transfer.bundle.request.id
          : transfer.id;
    if (bundle.request.id !== expectedId || bundle.request.competitionId !== input.competitionId)
      throw new Error('Lane acknowledged a different transfer');
    if (transfer.operation === 'PREPARE_SOURCE' && JSON.stringify(bundle.request) !== JSON.stringify(transfer.request))
      throw new Error('Lane returned different transfer instructions');
    if (
      transfer.operation !== 'PREPARE_SOURCE' &&
      bundle.digest !== ('bundle' in transfer ? transfer.bundle.digest : transfer.digest)
    )
      throw new Error('Lane acknowledged another transfer snapshot');
    if (transfer.operation === 'RETIRE_SOURCE') {
      await this.context.retainCompetitionState(competition, {
        transferredSourceLaneIds: [...new Set([...(competition.transferredSourceLaneIds ?? []), input.laneId])],
      });
    }
    return bundle;
  }
}
