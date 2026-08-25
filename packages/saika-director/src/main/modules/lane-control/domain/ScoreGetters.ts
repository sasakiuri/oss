import type { LaneControlState } from './LaneControl';
import type { Shot } from './Shot';
import { totalShotsBeforeStage } from '@/shared/constants/roundConfig';

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function stageOf(state: LaneControlState) {
  return state.config.stages[state.stageIndex];
}

// ---------------------------------------------------------------------------
// Score getters
// ---------------------------------------------------------------------------

export function totalScore(state: LaneControlState): number {
  const sum = state.matchShots.reduce((s, shot) => s + shot.score.value, 0);
  return Math.round(sum * 10) / 10;
}

export function stageTotal(state: LaneControlState, stageIndex: number): number {
  const stage = state.config.stages[stageIndex];
  if (!stage || stage.type !== 'match') return 0;
  const startIndex = totalShotsBeforeStage(state.config, stageIndex);
  let count = 0;
  for (const series of stage.series) {
    count += series.shots;
  }
  const slice = state.matchShots.slice(startIndex, startIndex + count);
  const sum = slice.reduce((s, shot) => s + shot.score.value, 0);
  return Math.round(sum * 10) / 10;
}

export function seriesScores_byIndex(state: LaneControlState, stageIdx: number, seriesIdx: number): number[] {
  const stage = state.config.stages[stageIdx];
  if (!stage || stage.type !== 'match') return [];

  let shotOffset = totalShotsBeforeStage(state.config, stageIdx);
  for (let ri = 0; ri < seriesIdx; ri++) {
    shotOffset += stage.series[ri]!.shots;
  }
  const series = stage.series[seriesIdx];
  if (!series) return [];
  return state.matchShots.slice(shotOffset, shotOffset + series.shots).map((s) => s.score.value);
}

export function stageSeriesScores(state: LaneControlState, stageIndex: number): number[] {
  const stage = state.config.stages[stageIndex];
  if (!stage || stage.type !== 'match') return [];

  const totals: number[] = [];
  let shotOffset = totalShotsBeforeStage(state.config, stageIndex);
  for (const series of stage.series) {
    const slice = state.matchShots.slice(shotOffset, shotOffset + series.shots);
    const sum = slice.reduce((s, shot) => s + shot.score.value, 0);
    totals.push(Math.round(sum * 10) / 10);
    shotOffset += series.shots;
  }
  return totals;
}

export function currentSeriesShotCount(state: LaneControlState): number {
  return state.matchShots.length - state.matchShotsAtSeriesStart;
}

export function remainingTime(state: LaneControlState): number {
  return state.timer?.remainingSeconds ?? 0;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

export function seriesScores(state: LaneControlState): number[] {
  // Build series scores from the stage/series structure
  const scores: number[] = [];
  let shotOffset = 0;
  for (const stage of state.config.stages) {
    if (stage.type !== 'match') continue;
    for (const series of stage.series) {
      const slice = state.matchShots.slice(shotOffset, shotOffset + series.shots);
      const sum = slice.reduce((s, shot) => s + shot.score.value, 0);
      scores.push(Math.round(sum * 10) / 10);
      shotOffset += series.shots;
    }
  }
  return scores;
}

export function lastScore(state: LaneControlState): number | null {
  if (state.matchShots.length === 0 && state.preparationShots.length === 0) {
    return null;
  }
  const stage = stageOf(state);
  const shots = state.phase === 'ACTIVE' && stage?.type === 'preparation' ? state.preparationShots : state.matchShots;
  const last = shots[shots.length - 1];
  return last?.score.value ?? null;
}

export function recentShots(state: LaneControlState): number[] {
  const shots = state.matchShots;
  if (shots.length === 0) return [];
  // Find current series shot range
  let shotOffset = 0;
  for (let si = 0; si < state.config.stages.length; si++) {
    const s = state.config.stages[si]!;
    if (s.type !== 'match') continue;
    for (let ri = 0; ri < s.series.length; ri++) {
      if (si === state.stageIndex && ri === state.seriesIndex) {
        return shots.slice(shotOffset).map((s) => s.score.value);
      }
      shotOffset += s.series[ri]!.shots;
    }
  }
  return [];
}

export function displayShots(state: LaneControlState): Shot[] {
  const stage = stageOf(state);
  if (state.phase === 'ACTIVE' && stage?.type === 'preparation') {
    return [...state.preparationShots];
  }
  return [...state.matchShots];
}

export function displayShotCount(state: LaneControlState): number {
  return displayShots(state).length;
}

export function displayTotalScore(state: LaneControlState): number {
  const sum = displayShots(state).reduce((s, shot) => s + shot.score.value, 0);
  return Math.round(sum * 10) / 10;
}

export function displaySeriesWindow(state: LaneControlState): number[] {
  const shots = displayShots(state);
  if (shots.length === 0) return [];
  // Find current series start
  let shotOffset = 0;
  for (let si = 0; si < state.config.stages.length; si++) {
    const s = state.config.stages[si]!;
    if (s.type !== 'match') continue;
    for (let ri = 0; ri < s.series.length; ri++) {
      if (si === state.stageIndex && ri === state.seriesIndex) {
        return shots.slice(shotOffset).map((s) => s.score.value);
      }
      shotOffset += s.series[ri]!.shots;
    }
  }
  // Fallback for preparation display
  return shots.map((s) => s.score.value);
}

export function displaySeriesScores(state: LaneControlState): number[] {
  const shots = displayShots(state);
  const scores: number[] = [];
  let shotOffset = 0;
  for (const stage of state.config.stages) {
    if (stage.type !== 'match') continue;
    for (const series of stage.series) {
      const slice = shots.slice(shotOffset, shotOffset + series.shots);
      const subtotal = Math.round(slice.reduce((s, shot) => s + shot.score.value, 0) * 10) / 10;
      scores.push(subtotal);
      shotOffset += series.shots;
    }
  }
  return scores;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

export function stage1Total(state: LaneControlState): number {
  // Find the first match stage (stageIndex 1 typically)
  for (let i = 0; i < state.config.stages.length; i++) {
    if (state.config.stages[i]!.type === 'match') {
      return stageTotal(state, i);
    }
  }
  return 0;
}

export function stage2Total(state: LaneControlState): number {
  // Find the second match stage
  let matchCount = 0;
  for (let i = 0; i < state.config.stages.length; i++) {
    if (state.config.stages[i]!.type === 'match') {
      matchCount++;
      if (matchCount === 2) {
        return stageTotal(state, i);
      }
    }
  }
  return 0;
}

export function stage1Shots(state: LaneControlState): Shot[] {
  for (let i = 0; i < state.config.stages.length; i++) {
    const stage = state.config.stages[i]!;
    if (stage.type === 'match') {
      const startIndex = totalShotsBeforeStage(state.config, i);
      let count = 0;
      for (const series of stage.series) {
        count += series.shots;
      }
      return state.matchShots.slice(startIndex, startIndex + count);
    }
  }
  return [];
}

export function stage2Shots(state: LaneControlState): Shot[] {
  let matchCount = 0;
  for (let i = 0; i < state.config.stages.length; i++) {
    const stage = state.config.stages[i]!;
    if (stage.type === 'match') {
      matchCount++;
      if (matchCount === 2) {
        const startIndex = totalShotsBeforeStage(state.config, i);
        let count = 0;
        for (const series of stage.series) {
          count += series.shots;
        }
        return state.matchShots.slice(startIndex, startIndex + count);
      }
    }
  }
  return [];
}

export function allMatchShots(state: LaneControlState): Shot[] {
  return [...state.matchShots];
}
