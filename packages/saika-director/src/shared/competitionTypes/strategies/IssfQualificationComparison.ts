import type { ResultFormat } from '../CompetitionTypeDefinition';
import type { QualificationComparison, QualificationRankingInput } from '../CompetitionTypeStrategy';

const compared = (comparison: number): QualificationComparison => ({ comparison, issues: [] });
const missing = (criterion: string): QualificationComparison => ({
  comparison: 0,
  issues: [`Qualification tie needs ${criterion} evidence before its rank can be established (ISSF 6.15.1)`],
});

/** Pure rule-order comparison. An unknown higher-priority criterion never becomes a tie. */
export function assessIssfQualificationComparison(
  a: QualificationRankingInput,
  b: QualificationRankingInput,
  format: ResultFormat,
): QualificationComparison {
  if (a.totalScore !== b.totalScore) return compared(b.totalScore - a.totalScore);
  const decimal = format.tieBreakPolicy === 'ISSF_DECIMAL_RIFLE';
  if (!decimal) {
    const left = innerTenBounds(a, format.totalShots);
    const right = innerTenBounds(b, format.totalShots);
    if (left.minimum > right.maximum) return compared(-1);
    if (right.minimum > left.maximum) return compared(1);
    if (left.minimum !== left.maximum || right.minimum !== right.maximum) return missing('inner-ten count');
  }

  const ratio = (10 * format.totalSeries) / format.totalShots;
  const block = format.totalShots >= 10 && Number.isInteger(ratio) && ratio >= 1 ? ratio : 1;
  for (let end = format.totalSeries; end > 0; end -= block) {
    let left = 0;
    let right = 0;
    for (let index = Math.max(0, end - block); index < end; index++) {
      const aScore = a.seriesScores[index];
      const bScore = b.seriesScores[index];
      if (!finite(aScore) || !finite(bScore)) return missing('series countback');
      left += aScore;
      right += bScore;
    }
    if (left !== right) return compared(right - left);
  }

  for (let index = format.totalShots - 1; index >= 0; index--) {
    const aScore = decimal ? a.shots[index] : ring(a, index);
    const bScore = decimal ? b.shots[index] : ring(b, index);
    if (!finite(aScore) || !finite(bScore)) return missing('shot countback');
    if (aScore !== bScore) return compared(bScore - aScore);
    if (!decimal && aScore === 10) {
      const aInner = a.rankingShots?.[index]?.innerTen;
      const bInner = b.rankingShots?.[index]?.innerTen;
      if (typeof aInner !== 'boolean' || typeof bInner !== 'boolean') return missing('shot inner-ten');
      if (aInner !== bInner) return compared(aInner ? -1 : 1);
    }
  }
  if (!decimal) {
    for (let index = format.totalShots - 1; index >= 0; index--) {
      const aScore = a.rankingShots?.[index]?.decimalScore;
      const bScore = b.rankingShots?.[index]?.decimalScore;
      if (!finite(aScore) || !finite(bScore)) return missing('EST decimal countback');
      if (aScore !== bScore) return compared(bScore - aScore);
    }
  }
  return compared(0);
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function ring(input: QualificationRankingInput, index: number): number | undefined {
  const recorded = input.rankingShots?.[index]?.ringScore;
  if (finite(recorded)) return recorded;
  const shot = input.shots[index];
  return finite(shot) ? Math.floor(shot) : undefined;
}

function innerTenBounds(input: QualificationRankingInput, count: number) {
  let minimum = 0;
  let unknown = 0;
  for (let index = 0; index < count; index++) {
    const innerTen = input.rankingShots?.[index]?.innerTen;
    if (innerTen === true) minimum++;
    else if (innerTen !== false) unknown++;
  }
  return { minimum, maximum: minimum + unknown };
}
