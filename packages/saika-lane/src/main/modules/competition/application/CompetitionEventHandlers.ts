// SPDX-License-Identifier: MIT
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionTimer } from '@/main/modules/competition/domain/ICompetitionTimer';
import type {
  PhaseChangedEvent,
  ShotRecordedEvent,
  TimedTargetSequenceChangedEvent,
} from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';

import { emitPhaseChanged } from './emitPhaseChanged';
import { emitSeriesCompleted } from './emitSeriesCompleted';

/**
 * Awaited shot-progress hook factory
 *
 * Calls CompetitionState.recordShotInSeries() when a shot is recorded,
 * then announces persisted progress or completion of the series.
 */
export function createShotRecordedHandler(deps: {
  competitionRepository: ICompetitionRepository;
  eventBus: IEventBus;
}): (event: ShotRecordedEvent) => Promise<void> {
  const { competitionRepository, eventBus } = deps;

  return async (event) => {
    if (event.acquisitionContext?.shotDisposition === 'ISOLATED') return;
    const state = await competitionRepository.findActive();
    if (!state || !state.canAcceptShot()) return;

    // In IDLE (training mode), shots are accepted but not tracked in competition series
    if (state.phase !== 'ACTIVE') return;
    if (state.currentStageConfig.scored && event.shot.mode.isSighting()) return;

    const newState = state.recordShotInSeries();
    await competitionRepository.save(newState);

    if (newState.phase === 'SERIES_COMPLETE') {
      emitSeriesCompleted(eventBus, newState);
    } else {
      // Publish only after the authoritative counter has been saved.
      eventBus.emit({
        type: 'CompetitionProgressChanged',
        timestamp: Date.now(),
        aggregateId: newState.id,
        stageIndex: newState.currentStageIndex,
        seriesIndex: newState.currentSeriesIndex,
        shotCount: newState.seriesShotCount,
      });
    }
  };
}

/**
 * PhaseChanged event handler factory
 *
 * Controls the timer on phase change.
 * Starts the configured timer, retaining a stage deadline between its series.
 */
export function createPhaseChangedHandler(deps: {
  competitionRepository: ICompetitionRepository;
  timerService: ICompetitionTimer;
}): (event: PhaseChangedEvent) => void {
  const { competitionRepository, timerService } = deps;

  const continuesStageClock = (event: PhaseChangedEvent): boolean =>
    timerService.isStageTimerRunning(event.aggregateId, event.stageIndex);

  return (event) => {
    if (event.newPhase === 'ACTIVE') {
      void (async () => {
        try {
          const state = await competitionRepository.findById(event.aggregateId);
          if (!state || state.phase !== 'ACTIVE') return;

          if (
            state.usesStageTimer &&
            continuesStageClock(event) &&
            (event.previousPhase === 'SERIES_COMPLETE' || event.previousPhase === 'SERIES_ENTERED')
          )
            return;
          if (state.timer.totalSeconds > 0) {
            timerService.start(
              event.aggregateId,
              state.timer.remainingSeconds,
              state.timer.totalSeconds,
              state.currentStageConfig.scored && state.usesStageTimer ? state.currentStageIndex : null,
            );
          } else {
            timerService.stop();
          }
        } catch (error) {
          getLogger().error(
            'Failed to start timer from PhaseChanged',
            'domain',
            error instanceof Error ? { error: error.stack } : { error: String(error) },
          );
        }
      })();
    } else {
      if ((event.newPhase === 'SERIES_COMPLETE' || event.newPhase === 'SERIES_ENTERED') && continuesStageClock(event))
        return;
      timerService.stop();
    }
  };
}

/** Closes a MATCH series from the independent timed-target event stream. */
export function createTimedTargetSequenceChangedHandler(deps: {
  competitionRepository: ICompetitionRepository;
  eventBus: IEventBus;
}): (event: TimedTargetSequenceChangedEvent) => void {
  const { competitionRepository, eventBus } = deps;
  return (event) => {
    if (
      event.state.purpose !== 'MATCH' ||
      event.state.phase !== 'COMPLETE' ||
      event.state.executionContext?.shotDisposition === 'ISOLATED'
    )
      return;
    void (async () => {
      try {
        const state = await competitionRepository.findById(event.state.competitionId);
        if (
          !state ||
          state.phase !== 'ACTIVE' ||
          state.currentStageIndex !== event.state.stageIndex ||
          state.currentSeriesIndex !== event.state.seriesIndex ||
          state.currentSeriesConfig.timedTargetProgramId !== event.state.programId
        ) {
          return;
        }
        const completed = state.completeTimedTargetSeries(event.state.programId);
        await competitionRepository.save(completed);
        emitPhaseChanged(eventBus, completed, state.phase);
        emitSeriesCompleted(eventBus, completed);
      } catch (error) {
        getLogger().error(
          'Failed to complete timed target series',
          'domain',
          error instanceof Error ? { error: error.stack } : { error: String(error) },
        );
      }
    })();
  };
}
