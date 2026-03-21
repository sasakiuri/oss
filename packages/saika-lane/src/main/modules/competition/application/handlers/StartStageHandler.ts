// SPDX-License-Identifier: MIT
import type { StartStageInput, StartStageResult } from '@/main/composition/tokens';
import { emitPhaseChanged } from '@/main/modules/competition/application/emitPhaseChanged';
import type { SessionLifecycleService } from '@/main/modules/competition/application/SessionLifecycleService';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * createStartStageHandler
 *
 * Handler factory for the start stage command.
 *
 * - IDLE → normal start via startStage()
 * - ACTIVE (any) → session rotation → resetToIdle()
 * - SERIES_COMPLETE | SERIES_ENTERED | STAGE_ENTERED → session rotation → rewindToStage(0)
 */
export function createStartStageHandler(
  competitionRepository: ICompetitionRepository,
  sessionLifecycle: SessionLifecycleService,
  eventBus: IEventBus,
): CommandHandler<StartStageInput, StartStageResult> {
  return async (input) => {
    const state = await competitionRepository.findById(input.competitionId);
    if (!state) {
      throw ErrorCatalog.createError('COMPETITION_NOT_FOUND', { id: input.competitionId });
    }

    // IDLE → normal stage start
    if (state.phase === 'IDLE') {
      const previousPhase = state.phase;
      const newState = state.startStage();
      await competitionRepository.save(newState);

      emitPhaseChanged(eventBus, newState, previousPhase);
      return { sessionId: newState.sessionId };
    }

    // ACTIVE (any) → resetToIdle: session rotation + reset to IDLE state
    if (state.phase === 'ACTIVE') {
      const newSessionId = await sessionLifecycle.rotateSession(state.sessionId);

      const previousPhase = state.phase;
      const newState = state.withSessionId(newSessionId).resetToIdle();
      await competitionRepository.save(newState);

      emitPhaseChanged(eventBus, newState, previousPhase);
      return { sessionId: newSessionId };
    }

    // SERIES_COMPLETE / SERIES_ENTERED / STAGE_ENTERED → rewindToStage: session rotation
    if (state.phase === 'SERIES_COMPLETE' || state.phase === 'SERIES_ENTERED' || state.phase === 'STAGE_ENTERED') {
      const newSessionId = await sessionLifecycle.rotateSession(state.sessionId);

      const previousPhase = state.phase;
      const newState = state.withSessionId(newSessionId).rewindToStage(0);
      await competitionRepository.save(newState);

      emitPhaseChanged(eventBus, newState, previousPhase);
      return { sessionId: newSessionId };
    }

    // For any other phase, startStage() will throw an appropriate error
    const newState = state.startStage();
    await competitionRepository.save(newState);
    return { sessionId: newState.sessionId };
  };
}
