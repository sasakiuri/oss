import type { CompetitionTypeDefinition } from './CompetitionTypeDefinition';

/** Returns the ordered, finite match-series sizes declared by an event definition. */
export function getMatchSeriesShotCounts(definition: CompetitionTypeDefinition): number[] {
  return definition.config.stages
    .filter((stage) => stage.type === 'match')
    .flatMap((stage) => stage.series.map((series) => series.shots))
    .filter((shots) => shots > 0);
}

/** Truncates a declared layout to shots that are actually present, including a partial current series. */
export function getAvailableSeriesShotCounts(declaredShotCounts: readonly number[], availableShots: number): number[] {
  if (!Number.isInteger(availableShots) || availableShots < 0) {
    throw new Error('availableShots must be a non-negative integer');
  }

  const availableCounts: number[] = [];
  let remaining = availableShots;
  for (const declaredCount of declaredShotCounts) {
    if (!Number.isInteger(declaredCount) || declaredCount < 1) {
      throw new Error('Series shot counts must be positive integers');
    }
    if (remaining === 0) break;
    const count = Math.min(declaredCount, remaining);
    availableCounts.push(count);
    remaining -= count;
  }
  if (remaining > 0) throw new Error('Available shots exceed the declared match-series layout');
  return availableCounts;
}

/** Resolves an absolute zero-based shot index to its zero-based series index. */
export function getSeriesIndexForShot(seriesShotCounts: readonly number[], shotIndex: number): number | null {
  if (!Number.isInteger(shotIndex) || shotIndex < 0) return null;
  let start = 0;
  for (let seriesIndex = 0; seriesIndex < seriesShotCounts.length; seriesIndex += 1) {
    const end = start + (seriesShotCounts[seriesIndex] ?? 0);
    if (shotIndex >= start && shotIndex < end) return seriesIndex;
    start = end;
  }
  return null;
}

/** Sums integer score units into the supplied series layout. */
export function sumScoresBySeries(scores: readonly number[], seriesShotCounts: readonly number[]): number[] {
  const totals: number[] = [];
  let start = 0;
  for (const count of seriesShotCounts) {
    const end = start + count;
    totals.push(scores.slice(start, end).reduce((sum, score) => sum + score, 0));
    start = end;
  }
  if (start !== scores.length) throw new Error('Series layout does not account for every available score');
  return totals;
}
