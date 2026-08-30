import type {
  CompetitionDataOperationContext,
  ICompetitionDataGuard,
} from '@/main/shared-infra/operations/CompetitionDataGuard';

import type { IRangeInterruptionRepository } from '../domain/IRangeInterruptionRepository';

/** Adapts unfinished interruption records to the generic competition-data guard port. */
export class InterruptionCompetitionDataGuard implements ICompetitionDataGuard {
  constructor(private readonly repository: IRangeInterruptionRepository) {}

  assertAllowed(context: CompetitionDataOperationContext): void {
    const active = this.repository.findActiveDataHolds(
      { scopeType: 'COMPETITION', scopeId: context.competitionId },
      context.laneId,
    );
    if (active.length === 0) return;

    const references = active.map((interruption) => interruption.id.slice(0, 8)).join(', ');
    throw new Error(
      `Range interruption ${references} is not closed; finish its audit record before ${operationLabel(context.operation)}`,
    );
  }
}

function operationLabel(operation: CompetitionDataOperationContext['operation']): string {
  switch (operation) {
    case 'LEAVE_LANE':
      return 'removing the Lane';
    case 'RESET_LANE_SESSION':
      return 'resetting the Lane session';
    case 'CLEAR_COMPETITION_DATA':
      return 'clearing competition data';
  }
}
