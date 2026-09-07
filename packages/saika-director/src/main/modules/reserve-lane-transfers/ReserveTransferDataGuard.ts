// SPDX-License-Identifier: MIT
import type {
  CompetitionDataOperationContext,
  ICompetitionDataGuard,
} from '@/main/shared-infra/operations/CompetitionDataGuard';

import type { IReserveTransferRepository } from './ReserveLaneTransferService';

export class ReserveTransferDataGuard implements ICompetitionDataGuard {
  constructor(private readonly repository: IReserveTransferRepository) {}
  assertAllowed(context: CompetitionDataOperationContext): void {
    const pending = this.repository
      .list(context.competitionId)
      .filter(
        (request) => !context.laneId || [request.sourceLaneId, request.destinationLaneId].includes(context.laneId),
      )
      .filter(
        (request) =>
          !this.repository
            .entries(request.id)
            .some((entry) => ['TARGET_ACTIVE', 'CANCELLED'].includes(entry.operation)),
      );
    if (pending.length)
      throw new Error(
        `Complete or cancel pending reserve transfer ${pending.map((request) => request.id).join(', ')} before clearing competition data`,
      );
  }
}
