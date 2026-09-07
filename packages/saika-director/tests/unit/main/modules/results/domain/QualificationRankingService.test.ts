import { describe, expect, it } from 'vitest';

import { EventId, ParticipantId } from '@/main/modules/championship';
import { ProjectedQualificationResult } from '@/main/modules/results/domain/ProjectedQualificationResult';
import { QualificationRankingService } from '@/main/modules/results/domain/QualificationRankingService';
import { Result } from '@/main/modules/results/domain/Result';
import { ResultId } from '@/main/modules/results/domain/ResultId';
import { ScoringDecisionProjector } from '@/main/modules/scoring-decisions';
import { IssfStandardStrategy } from '@/shared/competitionTypes';

const format = { totalShots: 60, totalSeries: 6, tieBreakPolicy: 'ISSF_FULL_RING' as const };
function projected(name: string, lastSeries: number, innerTenCount: number | null) {
  const series = [190 - lastSeries, 100, 100, 100, 100, lastSeries];
  const shots = series.flatMap((score) => Array.from({ length: 10 }, (_, index) => (index < score - 90 ? 10 : 9)));
  let remaining = innerTenCount ?? 0;
  const evidence = shots.map((ringScore, index) => ({
    ringScore,
    decimalScore: ringScore,
    innerTen: innerTenCount === null ? null : ringScore === 10 && remaining-- > 0,
    shotId: String(index),
    seriesIndex: Math.floor(index / 10),
  }));
  const source = Result.create(
    ResultId.reconstruct(crypto.randomUUID()),
    EventId.reconstruct(crypto.randomUUID()),
    ParticipantId.reconstruct(crypto.randomUUID()),
    name,
    'Team',
    590,
    series,
    shots,
    1,
    'confirmed',
    format,
    null,
    name,
    null,
    evidence,
  );
  return new ProjectedQualificationResult(
    source,
    new ScoringDecisionProjector().project(
      {
        totalScoreX10: 5900,
        seriesScoresX10: series.map((score) => score * 10),
        shotsX10: shots.map((score) => score * 10),
        shotsPerSeries: 10,
      },
      [],
    ),
    new IssfStandardStrategy(),
    format,
  );
}

describe('QualificationRankingService', () => {
  it('keeps the entire uncertain group provisional in every arrival order', () => {
    const a = projected('Adams', 90, 20);
    const b = projected('Baker', 100, 10);
    const c = projected('Clark', 95, null);
    const service = new QualificationRankingService();
    for (const inputs of [
      [a, b, c],
      [a, c, b],
      [b, a, c],
      [b, c, a],
      [c, a, b],
      [c, b, a],
    ]) {
      const ranked = service.calculateRankings(inputs);
      expect(ranked.map((item) => [item.result.source.playerName, item.rank])).toEqual([
        ['Adams', 1],
        ['Baker', 1],
        ['Clark', 1],
      ]);
      expect(ranked.every((item) => item.issues.length > 0)).toBe(true);
    }
    const reconciled = service.calculateRankings([b, projected('Clark', 95, 15), a]);
    expect(reconciled.map((item) => [item.result.source.playerName, item.rank])).toEqual([
      ['Adams', 1],
      ['Clark', 2],
      ['Baker', 3],
    ]);
    expect(reconciled.every((item) => item.issues.length === 0)).toBe(true);
  });
});
