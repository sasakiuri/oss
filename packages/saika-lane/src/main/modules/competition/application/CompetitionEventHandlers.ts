// SPDX-License-Identifier: MIT
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import type {
  PhaseChangedEvent,
  ShotRecordedEvent,
  TimedTargetSequenceChangedEvent,
} from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';

/**
 * ShotRecorded event handler factory
 *
 * Calls CompetitionState.recordShotInSeries() when a shot is recorded,
 * and emits a SeriesCompleted event when the series is complete.
 */
export function createShotRecordedHandler(deps: {
  competitionRepository: ICompetitionRepository;
  eventBus: IEventBus;
}): (event?: ShotRecordedEvent) => Promise<void> {
  const { competitionRepository, eventBus } = deps;

  return async (event) => {
    try {
      if (event?.acquisitionContext?.shotDisposition === 'ISOLATED') return;
      const state = await competitionRepository.findActive();
      if (!state || !state.canAcceptShot()) return;

      // In IDLE (training mode), shots are accepted but not tracked in competition series
      if (state.phase !== 'ACTIVE') return;
      if (state.currentStageConfig.scored && event?.shot.mode.isSighting()) return;

      const newState = state.recordShotInSeries();
      await competitionRepository.save(newState);

      if (newState.phase === 'SERIES_COMPLETE') {
        eventBus.emit({
          type: 'SeriesCompleted',
          timestamp: Date.now(),
          aggregateId: newState.id,
          stageIndex: newState.currentStageIndex,
          seriesIndex: newState.currentSeriesIndex,
          shotCount: newState.seriesShotCount,
        });
      }
    } catch (error) {
      getLogger().error(
        'Failed to record shot in competition',
        'domain',
        error instanceof Error ? { error: error.stack } : { error: String(error) },
      );
    }
  };
}

/**
 * PhaseChanged event handler factory
 *
 * Controls the timer on phase change.
 * ACTIVE → fetch timer info from repository and start; otherwise → stop.
 */
export function createPhaseChangedHandler(deps: {
  competitionRepository: ICompetitionRepository;
  timerService: LaneTimerService;
}): (event: PhaseChangedEvent) => void {
  const { competitionRepository, timerService } = deps;

  return (event) => {
    if (event.newPhase === 'ACTIVE') {
      void (async () => {
        try {
          const state = await competitionRepository.findById(event.aggregateId);
          if (!state || state.phase !== 'ACTIVE') return;

          if (state.timer.totalSeconds > 0) {
            timerService.start(event.aggregateId, state.timer.remainingSeconds, state.timer.totalSeconds);
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
        eventBus.emit({
          type: 'PhaseChanged',
          timestamp: Date.now(),
          aggregateId: completed.id,
          previousPhase: state.phase,
          newPhase: completed.phase,
          stageIndex: completed.currentStageIndex,
          seriesIndex: completed.currentSeriesIndex,
          stageName: completed.currentStageConfig.name,
          scored: completed.currentStageConfig.scored,
          targetProfileId: completed.currentStageConfig.targetProfileId ?? completed.config.targetProfileId,
          scoringGaugeProfileId:
            completed.currentStageConfig.scoringGaugeProfileId ?? completed.config.scoringGaugeProfileId,
        });
        eventBus.emit({
          type: 'SeriesCompleted',
          timestamp: Date.now(),
          aggregateId: completed.id,
          stageIndex: completed.currentStageIndex,
          seriesIndex: completed.currentSeriesIndex,
          shotCount: completed.seriesShotCount,
        });
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
