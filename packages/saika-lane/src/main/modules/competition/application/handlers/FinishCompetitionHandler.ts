// SPDX-License-Identifier: MIT
import type { FinishCompetitionInput } from '@/main/composition/tokens';
import { emitPhaseChanged } from '@/main/modules/competition/application/emitPhaseChanged';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * createFinishCompetitionHandler
 *
 * Handler factory for the finish competition command.
 * Transitions CompetitionState to FINISHED and also finishes the Session.
 */
export function createFinishCompetitionHandler(
  competitionRepository: ICompetitionRepository,
  sessionRepository: ISessionRepository,
  eventBus: IEventBus,
): CommandHandler<FinishCompetitionInput> {
  return async (input) => {
    const state = await competitionRepository.findById(input.competitionId);
    if (!state) {
      throw ErrorCatalog.createError('COMPETITION_NOT_FOUND', { id: input.competitionId });
    }

    const previousPhase = state.phase;
    const newState = state.finish();
    await competitionRepository.save(newState);

    // Also finish the Session
    const session = await sessionRepository.findById(newState.sessionId);
    if (session && !session.isFinished) {
      const finishedSession = session.finish();
      await sessionRepository.save(finishedSession);
    }

    eventBus.emit({
      type: 'CompetitionFinished',
      timestamp: Date.now(),
      aggregateId: newState.id,
      sessionId: newState.sessionId,
    });

    emitPhaseChanged(eventBus, newState, previousPhase);
  };
}
