import { describe, expect, it } from 'vitest';

import { EventId, ParticipantId } from '@/main/modules/championship';
import { ProjectedQualificationResult } from '@/main/modules/results/domain/ProjectedQualificationResult';
import { RankingService } from '@/main/modules/results/domain/RankingService';
import { Result } from '@/main/modules/results/domain/Result';
import { ResultId } from '@/main/modules/results/domain/ResultId';
import { ScoringDecisionProjector } from '@/main/modules/scoring-decisions';
import { IssfStandardStrategy } from '@/shared/competitionTypes';
import type { RankingShotEvidence, ResultFormat } from '@/shared/competitionTypes';

const format: ResultFormat = {
  totalShots: 2,
  totalSeries: 1,
  tieBreakPolicy: 'ISSF_FULL_RING',
};

function projected(familyName: string, innerTens: [boolean, boolean]): ProjectedQualificationResult {
  const rankingShots: RankingShotEvidence[] = innerTens.map((innerTen, index) => ({
    ringScore: 10,
    decimalScore: 10.2,
    innerTen,
    shotId: `${familyName}-${index}`,
    seriesIndex: 0,
  }));
  const source = Result.create(
    ResultId.generate(),
    EventId.generate(),
    ParticipantId.generate(),
    `Athlete ${familyName}`,
    'Team',
    20,
    [20],
    [10, 10],
    1,
    'published',
    format,
    null,
    familyName,
    null,
    rankingShots,
  );
  const projection = new ScoringDecisionProjector().project(
    { totalScoreX10: 200, seriesScoresX10: [200], shotsX10: [100, 100], shotsPerSeries: 2 },
    [],
  );
  return new ProjectedQualificationResult(source, projection, new IssfStandardStrategy(), format, 'COMPETING');
}

describe('ProjectedQualificationResult ranking', () => {
  it('keeps an unresolved tie at the same rank while listing family names alphabetically', () => {
    const rankings = new RankingService().calculateRankings([
      projected('Zulu', [false, false]),
      projected('Adams', [false, false]),
    ]);

    expect(rankings.map((entry) => entry.result.source.familyName)).toEqual(['Adams', 'Zulu']);
    expect(rankings.map((entry) => entry.rank)).toEqual([1, 1]);
  });

  it('assigns different ranks when the ISSF inner-ten criterion resolves the tie', () => {
    const rankings = new RankingService().calculateRankings([
      projected('Adams', [false, false]),
      projected('Zulu', [true, false]),
    ]);

    expect(rankings.map((entry) => entry.result.source.familyName)).toEqual(['Zulu', 'Adams']);
    expect(rankings.map((entry) => entry.rank)).toEqual([1, 2]);
  });
});
