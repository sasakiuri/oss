import type { RankingShotEvidence } from '@/shared/competitionTypes';

export interface RankingSeriesEvidenceInput {
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly scoresX10: readonly number[];
}

export interface RankingShotSourceEvidence {
  readonly shotId: string;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly shotNumberInSeries: number;
  readonly effectiveScoreX10: number;
  readonly deviceScoreX10: number | null;
  readonly calculatedScoreX10: number;
  readonly calculatedScoreAvailable: boolean;
  readonly innerTen: boolean;
}

/**
 * Pure evidence assembler. Result calculation remains authoritative; source
 * observations are attached only when their structured position and effective
 * value agree with the published score snapshot.
 */
export function assembleRankingEvidence(
  series: readonly RankingSeriesEvidenceInput[],
  deliveries: readonly RankingShotSourceEvidence[],
): RankingShotEvidence[] {
  const canonicalByShotId = new Map<string, RankingShotSourceEvidence>();
  for (const delivery of deliveries) {
    const existing = canonicalByShotId.get(delivery.shotId);
    if (!existing || (!existing.calculatedScoreAvailable && delivery.calculatedScoreAvailable)) {
      canonicalByShotId.set(delivery.shotId, delivery);
    }
  }

  const candidatesByPosition = new Map<string, RankingShotSourceEvidence[]>();
  for (const delivery of canonicalByShotId.values()) {
    const key = positionKey(delivery.stageIndex, delivery.seriesIndex, delivery.shotNumberInSeries);
    const candidates = candidatesByPosition.get(key) ?? [];
    candidates.push(delivery);
    candidatesByPosition.set(key, candidates);
  }

  const sortedSeries = [...series].sort(
    (left, right) => left.stageIndex - right.stageIndex || left.seriesIndex - right.seriesIndex,
  );

  return sortedSeries.flatMap((entry, flattenedSeriesIndex) =>
    entry.scoresX10.map((effectiveScoreX10, shotIndex) => {
      const candidates = (
        candidatesByPosition.get(positionKey(entry.stageIndex, entry.seriesIndex, shotIndex + 1)) ?? []
      ).filter((candidate) => candidate.effectiveScoreX10 === effectiveScoreX10);
      const source = candidates.length === 1 ? candidates[0]! : null;
      const deviceDecimalScore = source?.deviceScoreX10 ?? null;
      return {
        ringScore: Math.floor(effectiveScoreX10 / 10),
        // Rule 6.15.1(d) requires EST decimal-ring values. Saika's coordinate
        // calculation remains diagnostic evidence and must not silently become
        // the official tie-break value.
        decimalScore: deviceDecimalScore === null ? null : deviceDecimalScore / 10,
        decimalScoreSource: deviceDecimalScore === null ? null : ('DEVICE' as const),
        innerTen: source?.innerTen ?? null,
        innerTenSource: source === null ? null : ('CALCULATED' as const),
        scoreConflict:
          source !== null &&
          source.deviceScoreX10 != null &&
          source.calculatedScoreAvailable &&
          source.deviceScoreX10 !== source.calculatedScoreX10,
        shotId: source?.shotId ?? null,
        seriesIndex: flattenedSeriesIndex,
      };
    }),
  );
}

function positionKey(stageIndex: number, seriesIndex: number, shotNumberInSeries: number): string {
  return `${stageIndex}:${seriesIndex}:${shotNumberInSeries}`;
}
