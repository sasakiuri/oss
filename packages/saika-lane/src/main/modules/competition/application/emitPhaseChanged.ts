// SPDX-License-Identifier: MIT
import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { Phase } from '@/main/modules/competition/domain/Phase';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

/**
 * Helper to emit a PhaseChanged event.
 * Centralizes the common PhaseChanged event construction logic shared across 4 handlers.
 */
export function emitPhaseChanged(eventBus: IEventBus, state: CompetitionState, previousPhase: Phase): void {
  eventBus.emit({
    type: 'PhaseChanged',
    timestamp: Date.now(),
    aggregateId: state.id,
    previousPhase,
    newPhase: state.phase,
    stageIndex: state.currentStageIndex,
    seriesIndex: state.currentSeriesIndex,
    stageName: state.currentStageConfig.name,
    scored: state.currentStageConfig.scored,
  });
}
