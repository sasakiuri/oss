import type { IRankable } from './IRankable';

export interface RankedResult<T> {
  result: T;
  rank: number;
}

export class RankingService {
  calculateRankings<T extends IRankable<T>>(results: T[]): RankedResult<T>[] {
    if (results.length === 0) {
      return [];
    }

    const sortedResults = [...results].sort((a, b) => {
      const rankingDifference = a.compareTo(b);
      if (rankingDifference !== 0) return rankingDifference;
      return a.compareEqualForDisplay?.(b) ?? 0;
    });

    const rankedResults: RankedResult<T>[] = [];
    let currentRank = 1;

    sortedResults.forEach((result, i) => {
      if (i === 0) {
        rankedResults.push({ result, rank: currentRank });
      } else {
        const previousResult = sortedResults[i - 1]!;
        if (result.compareTo(previousResult) === 0) {
          rankedResults.push({ result, rank: currentRank });
        } else {
          currentRank = i + 1;
          rankedResults.push({ result, rank: currentRank });
        }
      }
    });

    return rankedResults;
  }
}
