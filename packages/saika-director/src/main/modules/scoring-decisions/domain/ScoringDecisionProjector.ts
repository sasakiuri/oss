import { getActiveScoringDecisions, type ScoringClassificationCode, type ScoringDecision } from './ScoringDecision';

export interface ScoreProjectionInput {
  totalScoreX10: number;
  seriesScoresX10: readonly number[];
  shotsX10: readonly number[];
  /** Uniform series size, used by qualification events. */
  shotsPerSeries?: number;
  /** Explicit series sizes, used by Finals and other variable-series events. */
  seriesShotCounts?: readonly number[];
}

export interface DecisionApplicationTrace {
  decisionId: string;
  seriesIndex: number | null;
  shotIndex: number | null;
}

export interface ScoreDecisionProjection {
  totalScoreX10: number;
  scoreBeforeClassificationX10: number;
  seriesScoresX10: readonly number[];
  shotsX10: readonly number[];
  deductionTotalX10: number;
  annulledScoreX10: number;
  scoreAdjustmentX10: number;
  classificationCode: ScoringClassificationCode | null;
  remarks: readonly string[];
  activeDecisionIds: readonly string[];
  applications: readonly DecisionApplicationTrace[];
  issues: readonly string[];
}

/** Pure projection: source scores and decisions remain immutable and independently auditable. */
export class ScoringDecisionProjector {
  project(input: ScoreProjectionInput, history: readonly ScoringDecision[]): ScoreDecisionProjection {
    const seriesRanges = resolveSeriesRanges(input);

    const active = getActiveScoringDecisions(history).sort(compareDecisionOrder);
    const shots = [...input.shotsX10];
    const deductionsBySeries = input.seriesScoresX10.map(() => 0);
    const annulmentsBySeries = input.seriesScoresX10.map(() => 0);
    const annulledShotIndices = new Set<number>();
    const applications: DecisionApplicationTrace[] = [];
    const issues: string[] = [];
    let classificationCode: ScoringClassificationCode | null = null;

    for (const decision of active) {
      if (decision.type === 'DISQUALIFICATION') {
        classificationCode = decision.classificationCode;
        applications.push({ decisionId: decision.id, seriesIndex: null, shotIndex: null });
        continue;
      }

      if (decision.type === 'DEDUCTION') {
        const seriesIndex = decision.seriesIndex;
        if (seriesIndex === null || deductionsBySeries[seriesIndex] === undefined || decision.pointsX10 === null) {
          issues.push(`Decision ${decision.id} targets an unavailable series`);
          continue;
        }
        const shotIndex =
          decision.applicationPolicy === 'SPECIFIC_SHOT'
            ? decision.shotIndex
            : findLowestShotIndex(shots, seriesRanges[seriesIndex]);
        if (shotIndex !== null && !shotBelongsToSeries(shotIndex, seriesRanges[seriesIndex])) {
          issues.push(`Decision ${decision.id} targets a shot outside its selected series`);
          continue;
        }
        deductionsBySeries[seriesIndex] += decision.pointsX10;
        applications.push({ decisionId: decision.id, seriesIndex, shotIndex });
        continue;
      }

      if (decision.type === 'ANNUL_SHOT' || decision.type === 'MARK_MISS') {
        const seriesIndex = decision.seriesIndex;
        const shotIndex = decision.shotIndex;
        if (
          seriesIndex === null ||
          shotIndex === null ||
          annulmentsBySeries[seriesIndex] === undefined ||
          shots[shotIndex] === undefined ||
          !shotBelongsToSeries(shotIndex, seriesRanges[seriesIndex])
        ) {
          issues.push(`Decision ${decision.id} targets an unavailable shot`);
          continue;
        }
        if (!annulledShotIndices.has(shotIndex)) {
          annulledShotIndices.add(shotIndex);
          annulmentsBySeries[seriesIndex] += shots[shotIndex] ?? 0;
          shots[shotIndex] = 0;
        }
        applications.push({ decisionId: decision.id, seriesIndex, shotIndex });
        continue;
      }

      applications.push({
        decisionId: decision.id,
        seriesIndex: decision.seriesIndex,
        shotIndex: decision.shotIndex,
      });
    }

    const seriesScores = input.seriesScoresX10.map((score, index) =>
      Math.max(0, score - (deductionsBySeries[index] ?? 0) - (annulmentsBySeries[index] ?? 0)),
    );
    const deductionTotalX10 = deductionsBySeries.reduce((sum, value) => sum + value, 0);
    const annulledScoreX10 = annulmentsBySeries.reduce((sum, value) => sum + value, 0);
    const scoreBeforeClassificationX10 = Math.max(0, input.totalScoreX10 - deductionTotalX10 - annulledScoreX10);
    const totalScoreX10 = classificationCode === null ? scoreBeforeClassificationX10 : 0;

    return Object.freeze({
      totalScoreX10,
      scoreBeforeClassificationX10,
      seriesScoresX10: Object.freeze(seriesScores),
      shotsX10: Object.freeze(shots),
      deductionTotalX10,
      annulledScoreX10,
      scoreAdjustmentX10: input.totalScoreX10 - totalScoreX10,
      classificationCode,
      remarks: Object.freeze(active.map((decision) => decision.publicRemark)),
      activeDecisionIds: Object.freeze(active.map((decision) => decision.id)),
      applications: Object.freeze(applications),
      issues: Object.freeze(issues),
    });
  }
}

function compareDecisionOrder(left: ScoringDecision, right: ScoringDecision): number {
  const timeDifference = left.decidedAt.getTime() - right.decidedAt.getTime();
  return timeDifference === 0 ? left.id.localeCompare(right.id) : timeDifference;
}

interface SeriesRange {
  readonly start: number;
  readonly end: number;
}

function resolveSeriesRanges(input: ScoreProjectionInput): readonly SeriesRange[] {
  const hasUniformSize = input.shotsPerSeries !== undefined;
  const hasExplicitSizes = input.seriesShotCounts !== undefined;
  if (hasUniformSize === hasExplicitSizes) {
    throw new Error('Provide exactly one of shotsPerSeries or seriesShotCounts');
  }

  if (input.seriesShotCounts !== undefined) {
    if (input.seriesShotCounts.length !== input.seriesScoresX10.length) {
      throw new Error('seriesShotCounts must match the number of series scores');
    }
    if (input.seriesShotCounts.some((count) => !Number.isInteger(count) || count < 1)) {
      throw new Error('seriesShotCounts must contain positive integers');
    }
    const ranges: SeriesRange[] = [];
    let start = 0;
    for (const count of input.seriesShotCounts) {
      ranges.push({ start, end: start + count });
      start += count;
    }
    if (start !== input.shotsX10.length) {
      throw new Error('seriesShotCounts must account for every available shot');
    }
    return ranges;
  }

  if (!Number.isInteger(input.shotsPerSeries) || (input.shotsPerSeries ?? 0) < 1) {
    throw new Error('shotsPerSeries must be a positive integer');
  }
  const shotsPerSeries = input.shotsPerSeries as number;
  return input.seriesScoresX10.map((_, seriesIndex) => ({
    start: seriesIndex * shotsPerSeries,
    end: Math.min((seriesIndex + 1) * shotsPerSeries, input.shotsX10.length),
  }));
}

function shotBelongsToSeries(shotIndex: number, range: SeriesRange | undefined): boolean {
  return range !== undefined && shotIndex >= range.start && shotIndex < range.end;
}

function findLowestShotIndex(shots: readonly number[], range: SeriesRange | undefined): number | null {
  if (!range) return null;
  const { start, end } = range;
  if (start >= end) return null;
  let lowestIndex = start;
  for (let index = start + 1; index < end; index += 1) {
    if ((shots[index] ?? 0) < (shots[lowestIndex] ?? 0)) lowestIndex = index;
  }
  return lowestIndex;
}
