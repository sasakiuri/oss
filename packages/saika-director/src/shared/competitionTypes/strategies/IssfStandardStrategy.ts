import type {
  CompetitionTypeStrategy,
  QualificationRankingInput,
  RankingShotEvidence,
} from '../CompetitionTypeStrategy';
import type { ResultFormat } from '../CompetitionTypeDefinition';

/**
 * ISSF-standard strategy for full-ring and decimal qualification formats.
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

  compareResults(a: QualificationRankingInput, b: QualificationRankingInput, format: ResultFormat): number {
    if (a.totalScore !== b.totalScore) {
      return b.totalScore - a.totalScore;
    }

    if (format.tieBreakPolicy !== 'ISSF_DECIMAL_RIFLE') {
      // ISSF 6.15.1(a): highest number of inner tens.
      if (hasCompleteInnerTenEvidence(a, format) && hasCompleteInnerTenEvidence(b, format)) {
        const innerTenDifference = countInnerTens(b.rankingShots!) - countInnerTens(a.rankingShots!);
        if (innerTenDifference !== 0) return innerTenDifference;
      }
    }

    // ISSF 6.15.1(b), or 6.15.1(f) for decimal rifle: last 10-shot series backwards.
    for (let i = format.totalSeries - 1; i >= 0; i--) {
      const aScore = a.seriesScores[i] ?? 0;
      const bScore = b.seriesScores[i] ?? 0;
      if (aScore !== bScore) {
        return bScore - aScore;
      }
    }

    if (format.tieBreakPolicy === 'ISSF_DECIMAL_RIFLE') {
      return compareReverseNumbers(a.shots, b.shots, format.totalShots);
    }

    // ISSF 6.15.1(c): full-ring score shot-by-shot, with inner tens outranking ordinary tens.
    for (let i = format.totalShots - 1; i >= 0; i--) {
      const aRing = a.rankingShots?.[i]?.ringScore ?? Math.floor(a.shots[i] ?? 0);
      const bRing = b.rankingShots?.[i]?.ringScore ?? Math.floor(b.shots[i] ?? 0);
      const ringDifference = bRing - aRing;
      if (ringDifference !== 0) return ringDifference;
      const aInnerTen = a.rankingShots?.[i]?.innerTen;
      const bInnerTen = b.rankingShots?.[i]?.innerTen;
      if (
        aRing === 10 &&
        bRing === 10 &&
        aInnerTen !== null &&
        aInnerTen !== undefined &&
        bInnerTen !== null &&
        bInnerTen !== undefined
      ) {
        if (aInnerTen !== bInnerTen) return aInnerTen ? -1 : 1;
      }
    }

    // ISSF 6.15.1(d): EST decimal score shot-by-shot when complete evidence is available.
    if (hasCompleteDecimalEvidence(a, format) && hasCompleteDecimalEvidence(b, format)) {
      for (let i = format.totalShots - 1; i >= 0; i--) {
        const aDecimal = a.rankingShots![i]!.decimalScore!;
        const bDecimal = b.rankingShots![i]!.decimalScore!;
        if (aDecimal !== bDecimal) return bDecimal - aDecimal;
      }
    }

    return 0;
  }

  compareEqualResultsForDisplay(a: QualificationRankingInput, b: QualificationRankingInput): number {
    return new Intl.Collator('en', { sensitivity: 'base', usage: 'sort' }).compare(
      a.familyName ?? '',
      b.familyName ?? '',
    );
  }

  splitFinalStages(matchShots: number[], format: ResultFormat): { stage1Shots: number[]; stage2Shots: number[] } {
    const stage1Count = format.stage1Shots ?? 0;
    return {
      stage1Shots: matchShots.slice(0, stage1Count),
      stage2Shots: matchShots.slice(stage1Count),
    };
  }
}

function compareReverseNumbers(a: readonly number[], b: readonly number[], count: number): number {
  for (let index = count - 1; index >= 0; index -= 1) {
    const difference = (b[index] ?? 0) - (a[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function hasCompleteInnerTenEvidence(input: QualificationRankingInput, format: ResultFormat): boolean {
  return (
    input.rankingShots !== undefined &&
    input.rankingShots.length >= format.totalShots &&
    input.rankingShots.slice(0, format.totalShots).every((shot) => shot.innerTen !== null)
  );
}

function hasCompleteDecimalEvidence(input: QualificationRankingInput, format: ResultFormat): boolean {
  return (
    input.rankingShots !== undefined &&
    input.rankingShots.length >= format.totalShots &&
    input.rankingShots.slice(0, format.totalShots).every((shot) => shot.decimalScore !== null)
  );
}

function countInnerTens(shots: readonly RankingShotEvidence[]): number {
  return shots.reduce((count, shot) => count + Number(shot.innerTen === true), 0);
}
