import type { RoundConfig } from '@/shared/constants/roundConfig';

export function locateShot(
  shotIndex: number,
  config: RoundConfig,
): { stageIndex: number; seriesIndex: number; positionInSeries: number } {
  let remaining = shotIndex;
  for (let si = 0; si < config.stages.length; si++) {
    const stage = config.stages[si]!;
    if (stage.type !== 'match') continue;
    for (let ri = 0; ri < stage.series.length; ri++) {
      const shots = stage.series[ri]!.shots;
      if (remaining < shots) {
        return { stageIndex: si, seriesIndex: ri, positionInSeries: remaining };
      }
      remaining -= shots;
    }
  }
  throw new Error(`Shot index ${shotIndex} exceeds total shots`);
}

export function getStageTotalShots(config: RoundConfig, stageIndex: number): { startIndex: number; count: number } {
  let startIndex = 0;
  let count = 0;
  for (let si = 0; si < config.stages.length; si++) {
    const stage = config.stages[si]!;
    if (stage.type !== 'match') continue;
    const stageShots = stage.series.reduce((sum, s) => sum + s.shots, 0);
    if (si === stageIndex) {
      count = stageShots;
      break;
    }
    startIndex += stageShots;
  }
  return { startIndex, count };
}

export function getCurrentSeriesShotCount(
  matchShotsLength: number,
  config: RoundConfig,
  stageIndex: number,
  seriesIndex: number,
): number {
  let consumed = 0;
  for (let si = 0; si < config.stages.length; si++) {
    const stage = config.stages[si]!;
    if (stage.type !== 'match') continue;
    for (let ri = 0; ri < stage.series.length; ri++) {
      if (si === stageIndex && ri === seriesIndex) {
        return Math.max(0, Math.min(stage.series[ri]!.shots, matchShotsLength - consumed));
      }
      consumed += stage.series[ri]!.shots;
    }
  }
  return 0;
}

export function getStageSeriesScores(
  matchShots: readonly { score: { value: number } }[],
  config: RoundConfig,
  stageIndex: number,
): number[] {
  const totals: number[] = [];
  let shotOffset = 0;
  for (let si = 0; si < config.stages.length; si++) {
    const stage = config.stages[si]!;
    if (stage.type !== 'match') continue;
    for (let ri = 0; ri < stage.series.length; ri++) {
      const shots = stage.series[ri]!.shots;
      if (si === stageIndex) {
        const slice = matchShots.slice(shotOffset, shotOffset + shots);
        const sum = slice.reduce((s, shot) => s + shot.score.value, 0);
        totals.push(Math.round(sum * 10) / 10);
      }
      shotOffset += shots;
    }
  }
  return totals;
}

export function getStageTotal(
  matchShots: readonly { score: { value: number } }[],
  config: RoundConfig,
  stageIndex: number,
): number {
  const { startIndex, count } = getStageTotalShots(config, stageIndex);
  const slice = matchShots.slice(startIndex, startIndex + count);
  const sum = slice.reduce((s, shot) => s + shot.score.value, 0);
  return Math.round(sum * 10) / 10;
}

export function getSeriesScores(
  matchShots: readonly { score: { value: number } }[],
  config: RoundConfig,
  stageIndex: number,
  seriesIndex: number,
): number[] {
  let shotOffset = 0;
  for (let si = 0; si < config.stages.length; si++) {
    const stage = config.stages[si]!;
    if (stage.type !== 'match') continue;
    for (let ri = 0; ri < stage.series.length; ri++) {
      const shots = stage.series[ri]!.shots;
      if (si === stageIndex && ri === seriesIndex) {
        return matchShots.slice(shotOffset, shotOffset + shots).map((s) => s.score.value);
      }
      shotOffset += shots;
    }
  }
  return [];
}

export function totalShotsBeforeStage(config: RoundConfig, stageIndex: number): number {
  let total = 0;
  for (let si = 0; si < stageIndex; si++) {
    const stage = config.stages[si];
    if (stage && stage.type === 'match') {
      for (const series of stage.series) {
        total += series.shots;
      }
    }
  }
  return total;
}
