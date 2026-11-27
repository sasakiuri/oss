// SPDX-License-Identifier: MIT
import type { EndStageInput } from '@/main/composition/tokens';
import { emitPhaseChanged } from '@/main/modules/competition/application/emitPhaseChanged';
import { requireCompetition } from '@/main/modules/competition/application/requireCompetition';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

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
    const state = await requireCompetition(competitionRepository, input.competitionId);

    const previousPhase = state.phase;
    const newState = state.endStage();
    await competitionRepository.save(newState);

    emitPhaseChanged(eventBus, newState, previousPhase);
  };
}
