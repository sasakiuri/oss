import type { LaneControlState, MutablePatch } from './LaneControl';
import type { StageDefinition, SeriesDefinition } from '@/shared/competitionTypes/CompetitionTypeDefinition';
import type { LanePhase } from '@/shared/constants/competition';
import { Timer } from './Timer';
import type { Shot } from './Shot';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function seriesCompletePatch(state: LaneControlState): MutablePatch {
  const stage = state.config.stages[state.stageIndex]!;
  const isLastSeries = state.seriesIndex >= stage.series.length - 1;
  const isLastStage = state.stageIndex >= state.config.stages.length - 1;

  if (isLastSeries && isLastStage) {
    return { phase: 'FINISHED', timer: null };
  }
  return { phase: 'SERIES_COMPLETE' };
}

export function countCurrentSeriesShots(state: LaneControlState, totalMatchShots: number): number {
  return totalMatchShots - state.matchShotsAtSeriesStart;
}

// ---------------------------------------------------------------------------
// Timer-mode-specific shot handlers
// ---------------------------------------------------------------------------

export function handleShotModeShot(
  state: LaneControlState,
  _stage: StageDefinition,
  series: SeriesDefinition,
  newMatchShots: Shot[],
  timestamp: number,
  receivedShotNumber: number,
): MutablePatch {
  const newSlot = state.shotSlotInSeries + 1;
  if (newSlot >= series.shots) {
    // Series complete
    return {
      matchShots: newMatchShots,
      shotSlotInSeries: newSlot,
      lastShotTime: timestamp,
      lastReceivedShotNumber: receivedShotNumber,
      ...seriesCompletePatch(state),
    };
  }
  // More shots in series — transition to SHOT_COMPLETE (wait for next Match press)
  return {
    matchShots: newMatchShots,
    shotSlotInSeries: newSlot,
    phase: 'SHOT_COMPLETE' as LanePhase,
    timer: null,
    lastShotTime: timestamp,
    lastReceivedShotNumber: receivedShotNumber,
  };
}

export function handleSeriesModeShot(
  state: LaneControlState,
  series: SeriesDefinition,
  newMatchShots: Shot[],
  timestamp: number,
  receivedShotNumber: number,
): MutablePatch {
  const currentSeriesShotCount = countCurrentSeriesShots(state, newMatchShots.length);
  if (currentSeriesShotCount >= series.shots) {
    return {
      matchShots: newMatchShots,
      lastShotTime: timestamp,
      lastReceivedShotNumber: receivedShotNumber,
      ...seriesCompletePatch(state),
    };
  }
  return {
    matchShots: newMatchShots,
    lastShotTime: timestamp,
    lastReceivedShotNumber: receivedShotNumber,
  };
}

export function handleStageModeShot(
  state: LaneControlState,
  stage: StageDefinition,
  newMatchShots: Shot[],
  timestamp: number,
  receivedShotNumber: number,
): MutablePatch {
  const series = stage.series[state.seriesIndex]!;
  const currentSeriesShotCount = countCurrentSeriesShots(state, newMatchShots.length);
  if (currentSeriesShotCount >= series.shots) {
    // Check if this is the last series in the stage
    const nextSeriesIndex = state.seriesIndex + 1;
    if (nextSeriesIndex >= stage.series.length) {
      // Last series in stage - stage complete
      const isLastStage = state.stageIndex >= state.config.stages.length - 1;
      const nextPhase: LanePhase = isLastStage ? 'FINISHED' : 'SERIES_COMPLETE';
      return {
        matchShots: newMatchShots,
        lastShotTime: timestamp,
        lastReceivedShotNumber: receivedShotNumber,
        phase: nextPhase,
        timer: nextPhase === 'FINISHED' ? null : state.timer,
      };
    }
    // Auto-advance to next series (ACTIVE maintained, timer continues)
    return {
      matchShots: newMatchShots,
      seriesIndex: nextSeriesIndex,
      shotSlotInSeries: 0,
      lastShotTime: timestamp,
      lastReceivedShotNumber: receivedShotNumber,
      matchShotsAtSeriesStart: newMatchShots.length,
    };
  }
  return {
    matchShots: newMatchShots,
    lastShotTime: timestamp,
    lastReceivedShotNumber: receivedShotNumber,
  };
}

// ---------------------------------------------------------------------------
// Timer-expiry handlers (called from tickTimer when timer reaches 0)
// ---------------------------------------------------------------------------

export function handleShotTimerExpired(state: LaneControlState, stage: StageDefinition, newTimer: Timer): MutablePatch {
  const series = stage.series[state.seriesIndex]!;
  const newSlot = state.shotSlotInSeries + 1;
  if (newSlot >= series.shots) {
    // Series complete after timeout
    return {
      timer: newTimer,
      shotSlotInSeries: newSlot,
      ...seriesCompletePatch(state),
    };
  }
  // More shots in series — transition to SHOT_COMPLETE (wait for next Match press)
  return {
    shotSlotInSeries: newSlot,
    phase: 'SHOT_COMPLETE' as LanePhase,
    timer: null,
  };
}

export function handleSeriesTimerExpired(state: LaneControlState, newTimer: Timer): MutablePatch {
  return {
    timer: newTimer,
    ...seriesCompletePatch(state),
  };
}

export function handleStageTimerExpired(state: LaneControlState, newTimer: Timer): MutablePatch {
  const isLastStage = state.stageIndex >= state.config.stages.length - 1;
  const nextPhase: LanePhase = isLastStage ? 'FINISHED' : 'SERIES_COMPLETE';
  return {
    phase: nextPhase,
    timer: nextPhase === 'FINISHED' ? null : newTimer,
  };
}
