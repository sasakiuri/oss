// SPDX-License-Identifier: MIT
import type { RankingShotEvidence } from '@/shared/competitionTypes';
import type { ScoreCorrectionProjection } from './ResultScoreCorrectionSource';

/** Main-process read model; rendering DTOs do not expose adjudication evidence. */
export interface ResultDisplayProjection {
  readonly resultId: string;
  readonly participantId: string;
  readonly familyName: string | null;
  readonly seriesScores: readonly number[];
  readonly status: string;
  readonly rankingShots: readonly RankingShotEvidence[];
  readonly shots: readonly {
    readonly score: number;
    readonly sourceShotId: string | null;
    /** Position in the original result, never the position after an insertion. */
    readonly sourceShotIndex: number | null;
    readonly corrected: boolean;
  }[];
}

export interface IResultDisplayReader {
  getDisplayByEvent(eventId: string): Promise<ResultDisplayProjection[]>;
}

export function displayResultShots(
  scores: readonly number[],
  evidence: readonly RankingShotEvidence[],
  origins: ScoreCorrectionProjection['shotOrigins'],
): ResultDisplayProjection['shots'] {
  return scores.map((score, index) => ({
    score,
    sourceShotId: evidence[index]?.shotId ?? null,
    sourceShotIndex: origins[index]?.sourceShotIndex ?? null,
    corrected: origins[index]?.corrected ?? false,
  }));
}
