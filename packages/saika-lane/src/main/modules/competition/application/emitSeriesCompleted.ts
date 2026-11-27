// SPDX-License-Identifier: MIT
import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

/** Announces that the current series of a saved competition state is complete. */
export function emitSeriesCompleted(eventBus: IEventBus, state: CompetitionState): void {
  eventBus.emit({
    type: 'SeriesCompleted',
    timestamp: Date.now(),
    aggregateId: state.id,
    stageIndex: state.currentStageIndex,
    seriesIndex: state.currentSeriesIndex,
    shotCount: state.seriesShotCount,
  });
}
