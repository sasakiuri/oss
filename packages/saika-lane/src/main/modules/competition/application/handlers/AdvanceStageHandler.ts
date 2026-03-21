// SPDX-License-Identifier: MIT
import type { AdvanceStageInput } from '@/main/composition/tokens';
import { emitPhaseChanged } from '@/main/modules/competition/application/emitPhaseChanged';
import type { SessionLifecycleService } from '@/main/modules/competition/application/SessionLifecycleService';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * createAdvanceStageHandler
 *
 * Handler factory for the advance stage command.
 * Transitions from SERIES_COMPLETE → SERIES_ENTERED / STAGE_ENTERED / FINISHED.
 *
 * On preparation → match stage transition:
 *   Rotates the session via SessionLifecycleService and resets shot data.
 */
export function createAdvanceStageHandler(
  competitionRepository: ICompetitionRepository,
  sessionLifecycle: SessionLifecycleService,
  eventBus: IEventBus,
): CommandHandler<AdvanceStageInput> {
  return async (input) => {
    let state = await competitionRepository.findById(input.competitionId);
    if (!state) {
      throw ErrorCatalog.createError('COMPETITION_NOT_FOUND', { id: input.competitionId });
    }

    const previousPhase = state.phase;

    // Rotation check only when crossing stage boundaries
    const nextSeriesIndex = state.currentSeriesIndex + 1;
    const isStageTransition = nextSeriesIndex >= state.currentStageConfig.series.length;

    if (isStageTransition) {
      const nextStageIndex = state.currentStageIndex + 1;
      const nextStage = state.config.stages[nextStageIndex];
      if (nextStage?.requiresNewSession) {
        const newSessionId = await sessionLifecycle.rotateSession(state.sessionId);
        state = state.withSessionId(newSessionId);
      }
    }

    const newState = state.advanceToNextStage();
    await competitionRepository.save(newState);

    // Emit event when stage has changed (determined directly by Phase)
    if (newState.phase === 'STAGE_ENTERED') {
      eventBus.emit({
        type: 'StageAdvanced',
        timestamp: Date.now(),
        aggregateId: newState.id,
        previousStageIndex: state.currentStageIndex,
        newStageIndex: newState.currentStageIndex,
        stageName: newState.currentStageConfig.name,
        scored: newState.currentStageConfig.scored,
      });
    }

    // PhaseChanged is emitted after SessionStarted (preserve order)
    emitPhaseChanged(eventBus, newState, previousPhase);
  };
}
