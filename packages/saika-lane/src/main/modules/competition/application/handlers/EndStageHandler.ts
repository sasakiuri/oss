// SPDX-License-Identifier: MIT
import type { EndStageInput } from '@/main/composition/tokens';
import { emitPhaseChanged } from '@/main/modules/competition/application/emitPhaseChanged';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * createEndStageHandler
 *
 * Handler factory for the end stage command.
 * Transitions from ACTIVE → SERIES_COMPLETE.
 */
export function createEndStageHandler(
  competitionRepository: ICompetitionRepository,
  eventBus: IEventBus,
): CommandHandler<EndStageInput> {
  return async (input) => {
    const state = await competitionRepository.findById(input.competitionId);
    if (!state) {
      throw ErrorCatalog.createError('COMPETITION_NOT_FOUND', { id: input.competitionId });
    }

    const previousPhase = state.phase;
    const newState = state.endStage();
    await competitionRepository.save(newState);

    emitPhaseChanged(eventBus, newState, previousPhase);
  };
}
