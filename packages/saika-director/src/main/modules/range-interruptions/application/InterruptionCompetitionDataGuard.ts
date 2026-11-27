import {
  competitionDataOperationLabel,
  type CompetitionDataOperationContext,
  type ICompetitionDataGuard,
} from '@/main/shared-infra/operations/CompetitionDataGuard';

import type { IRangeInterruptionRepository } from '../domain/IRangeInterruptionRepository';
import { getRangeInterruptionState } from '../domain/RangeInterruptionEntry';

/** Adapts unfinished interruption records to the generic competition-data guard port. */
export class InterruptionCompetitionDataGuard implements ICompetitionDataGuard {
  constructor(private readonly repository: IRangeInterruptionRepository) {}

  assertAllowed(context: CompetitionDataOperationContext): void {
    const cases = this.repository
      .findCasesByScope({ scopeType: 'COMPETITION', scopeId: context.competitionId })
      .filter(
        (interruption) =>
          context.laneId === undefined || interruption.laneId === null || interruption.laneId === context.laneId,
      );
    const entries = this.repository.findEntriesByCaseIds(cases.map((interruption) => interruption.id));
    const active = cases.filter(
      (interruption) => getRangeInterruptionState(entries.get(interruption.id) ?? []).dataHoldActive,
    );
    if (active.length === 0) return;

    const references = active.map((interruption) => interruption.id.slice(0, 8)).join(', ');
    throw new Error(
      `Range interruption ${references} is not closed; finish its audit record before ${competitionDataOperationLabel(context.operation)}`,
    );
  }
}
