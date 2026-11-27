import {
  competitionDataOperationLabel,
  type CompetitionDataOperationContext,
  type ICompetitionDataGuard,
} from '@/main/shared-infra/operations/CompetitionDataGuard';

import type { ITargetExaminationRepository } from '../domain/ITargetExaminationRepository';
import { getTargetExaminationState } from '../domain/TargetExaminationEntry';

/** Adapts target-examination evidence holds to the generic competition-data guard port. */
export class EvidenceHoldCompetitionDataGuard implements ICompetitionDataGuard {
  constructor(private readonly repository: ITargetExaminationRepository) {}

  assertAllowed(context: CompetitionDataOperationContext): void {
    const cases = this.repository
      .findCasesByScope({ scopeType: 'COMPETITION', scopeId: context.competitionId })
      .filter(
        (examination) =>
          context.laneId === undefined || examination.laneId === null || examination.laneId === context.laneId,
      );
    const entries = this.repository.findEntriesByCaseIds(cases.map((examination) => examination.id));
    const holds = cases.filter(
      (examination) => getTargetExaminationState(entries.get(examination.id) ?? []).evidenceHoldActive,
    );
    if (holds.length === 0) return;

    const references = holds.map((examination) => examination.id.slice(0, 8)).join(', ');
    throw new Error(
      `Evidence hold is active for target examination ${references}; record authorization and release the hold before ${competitionDataOperationLabel(context.operation)}`,
    );
  }
}
