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

    const sortedResults = [...results].sort((a, b) => a.compareTo(b));

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
