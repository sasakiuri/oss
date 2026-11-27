// SPDX-License-Identifier: MIT
import type { StartNextSeriesInput } from '@/main/composition/tokens';
import { emitPhaseChanged } from '@/main/modules/competition/application/emitPhaseChanged';
import { requireCompetition } from '@/main/modules/competition/application/requireCompetition';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

/**
 * createStartNextSeriesHandler
 *
 * Handler factory for the start next series command.
 * Transitions from SERIES_COMPLETE / SERIES_ENTERED / STAGE_ENTERED → ACTIVE.
 */
export function createStartNextSeriesHandler(
  competitionRepository: ICompetitionRepository,
  eventBus: IEventBus,
): CommandHandler<StartNextSeriesInput> {
  return async (input) => {
    const state = await requireCompetition(competitionRepository, input.competitionId);

    const previousPhase = state.phase;
    const newState = state.startNextSeries();
    await competitionRepository.save(newState);

    emitPhaseChanged(eventBus, newState, previousPhase);
  };
}
