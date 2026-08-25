import type { LaneControlState } from './LaneControl';

export function canStartPreparation(state: LaneControlState): boolean {
  return state.phase === 'IDLE';
}

export function canAdvanceToNextStage(state: LaneControlState): boolean {
  if (state.phase === 'ACTIVE') {
    const nextStageIndex = state.stageIndex + 1;
    return nextStageIndex < state.config.stages.length;
  }
  if (state.phase === 'SERIES_COMPLETE') {
    const nextStageIndex = state.stageIndex + 1;
    return nextStageIndex < state.config.stages.length;
  }
  if (state.phase === 'SHOT_COMPLETE') {
    const nextStageIndex = state.stageIndex + 1;
    return nextStageIndex < state.config.stages.length;
  }
  return false;
}

export function canStartMatch(state: LaneControlState): boolean {
  if (state.phase === 'SHOT_COMPLETE') return true;
  if (state.phase === 'STAGE_ENTERED') return true;

  if (state.phase === 'SERIES_COMPLETE' || state.phase === 'ACTIVE') {
    const stage = state.config.stages[state.stageIndex];
    if (!stage) return false;
    const hasNextSeries = state.seriesIndex + 1 < stage.series.length;
    if (!hasNextSeries) return false;
    if (stage.timer.mode === 'stage' && state.timer?.isExpired) return false;
    return true;
  }
  return false;
}

export function canFinish(state: LaneControlState): boolean {
  return state.phase === 'ACTIVE' || state.phase === 'SERIES_COMPLETE' || state.phase === 'SHOT_COMPLETE';
}
