import type { CompetitionTypeStrategy } from '../CompetitionTypeStrategy';
import type { ResultFormat } from '../CompetitionTypeDefinition';

/**
 * ISSF-standard strategy for formats such as BR60S and BP60.
 */
export class IssfStandardStrategy implements CompetitionTypeStrategy {
  readonly id = 'standard';

  padShots(shotScores: number[], format: ResultFormat): number[] {
    const padded = [...shotScores];
    while (padded.length < format.totalShots) {
      padded.push(0);
    }
    return padded;
  }

  padSeries(seriesScores: number[], format: ResultFormat): number[] {
    const padded = [...seriesScores];
    while (padded.length < format.totalSeries) {
      padded.push(0);
    }
    return padded;
  }

  compareResults(
    a: { totalScore: number; seriesScores: readonly number[]; shots: readonly number[] },
    b: { totalScore: number; seriesScores: readonly number[]; shots: readonly number[] },
    format: ResultFormat,
  ): number {
    // 1. Compare totals in descending order (a higher score returns a negative value).
    if (a.totalScore !== b.totalScore) {
      return b.totalScore - a.totalScore;
    }

    // 2. Compare series in reverse order, descending.
    for (let i = format.totalSeries - 1; i >= 0; i--) {
      const aScore = a.seriesScores[i] ?? 0;
      const bScore = b.seriesScores[i] ?? 0;
      if (aScore !== bScore) {
        return bScore - aScore;
      }
    }

    // 3. Compare shots in reverse order, descending.
    for (let i = format.totalShots - 1; i >= 0; i--) {
      const aShot = a.shots[i] ?? 0;
      const bShot = b.shots[i] ?? 0;
      if (aShot !== bShot) {
        return bShot - aShot;
      }
    }

    // Exact tie.
    return 0;
  }

  splitFinalStages(matchShots: number[], format: ResultFormat): { stage1Shots: number[]; stage2Shots: number[] } {
    const stage1Count = format.stage1Shots ?? 0;
    return {
      stage1Shots: matchShots.slice(0, stage1Count),
      stage2Shots: matchShots.slice(stage1Count),
    };
  }
}
