import type {
  CompetitionDataOperationContext,
  ICompetitionDataGuard,
} from '@/main/shared-infra/operations/CompetitionDataGuard';

import type { ITargetExaminationRepository } from '../domain/ITargetExaminationRepository';

/** Adapts target-examination evidence holds to the generic competition-data guard port. */
export class EvidenceHoldCompetitionDataGuard implements ICompetitionDataGuard {
  constructor(private readonly repository: ITargetExaminationRepository) {}

  assertAllowed(context: CompetitionDataOperationContext): void {
    const holds = this.repository.findActiveEvidenceHolds(
      { scopeType: 'COMPETITION', scopeId: context.competitionId },
      context.laneId,
    );
    if (holds.length === 0) return;

    const references = holds.map((examination) => examination.id.slice(0, 8)).join(', ');
    throw new Error(
      `Evidence hold is active for target examination ${references}; record authorization and release the hold before ${operationLabel(context.operation)}`,
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
