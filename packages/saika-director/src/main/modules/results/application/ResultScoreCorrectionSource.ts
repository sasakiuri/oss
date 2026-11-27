// SPDX-License-Identifier: MIT
import type { ResultScope } from '@/shared/ipc/contracts';

import { getSeriesIndexForShot, type RankingShotEvidence } from '@/shared/competitionTypes';

import type { FinalResult } from '../domain/FinalResult';
import type { Result } from '../domain/Result';

import {
  applyQualificationScoreOverlays,
  qualificationScoreSourceDigest,
  type QualificationScoreOverlayHistory,
} from './QualificationScoreOverlaySource';
import { sha256Json } from '@/main/domain/sha256Json';

export interface CorrectableShot {
  readonly scoreX10: number;
  readonly ranking: RankingShotEvidence;
}
export interface ScoreCorrectionBasis {
  readonly resultScope: ResultScope;
  readonly resultId: string;
  readonly eventId: string;
  readonly participantId: string;
  readonly relayNumber: number;
  readonly competitionId: string | null;
  readonly sourceRevision: string;
  readonly seriesShotCounts: readonly number[];
  readonly shots: readonly CorrectableShot[];
  readonly issues: readonly string[];
}
export interface ScoreCorrectionProjection {
  readonly shots: readonly CorrectableShot[];
  readonly shotOrigins: readonly { readonly sourceShotIndex: number | null; readonly corrected: boolean }[];
  readonly revision: string;
  readonly ids: readonly string[];
  readonly remarks: readonly string[];
  readonly issues: readonly string[];
}
/** Consumer-owned projection port, independent from the originating adjudication workflow. */
export interface IResultScoreCorrectionSource {
  project(basis: ScoreCorrectionBasis): ScoreCorrectionProjection;
}
export const noResultScoreCorrections: IResultScoreCorrectionSource = {
  project: (basis) => ({
    shots: basis.shots,
    shotOrigins: basis.shots.map((_, sourceShotIndex) => ({ sourceShotIndex, corrected: false })),
    revision: '',
    ids: [],
    remarks: [],
    issues: [],
  }),
};
export function qualificationCorrectionBasis(
  result: Result,
  history: QualificationScoreOverlayHistory,
): ScoreCorrectionBasis {
  const base = applyQualificationScoreOverlays(result, history);
  const size = result.shots.length / result.seriesScores.length;
  return {
    resultScope: 'QUALIFICATION',
    resultId: result.id.value,
    eventId: result.eventId.value,
    participantId: result.participantId.value,
    relayNumber: result.relayNumber,
    competitionId: result.sourceCompetitionId,
    sourceRevision: sha256Json([qualificationScoreSourceDigest(result), history.revision]),
    seriesShotCounts: result.seriesScores.map(() => size),
    shots: base.shotsX10.map((scoreX10, index) => ({
      scoreX10,
      ranking: base.rankingShots[index] ?? {
        shotId: null,
        ringScore: Math.floor(scoreX10 / 10),
        decimalScore: null,
        innerTen: null,
        seriesIndex: Math.floor(index / size),
      },
    })),
    issues: [...base.issues, ...(!Number.isInteger(size) || size <= 0 ? ['Reconcile the source series layout'] : [])],
  };
}
export function finalCorrectionBasis(result: FinalResult, seriesShotCounts: readonly number[]): ScoreCorrectionBasis {
  const scores = [...result.stage1Shots, ...result.stage2Shots];
  return {
    resultScope: 'FINAL',
    resultId: result.id.value,
    eventId: result.eventId.value,
    participantId: result.participantId.value,
    relayNumber: 1,
    competitionId: null,
    sourceRevision: sha256Json(result),
    seriesShotCounts,
    shots: scores.map((score, index) => ({
      scoreX10: Math.round(score * 10),
      ranking: {
        shotId: null,
        ringScore: Math.floor(score),
        decimalScore: null,
        innerTen: null,
        seriesIndex: correctionSeriesIndex(seriesShotCounts, index),
      },
    })),
    issues: [],
  };
}
export function correctionSeriesIndex(counts: readonly number[], shotIndex: number): number {
  const index = getSeriesIndexForShot(counts, shotIndex);
  if (index === null) throw new Error('Shot does not belong to the source series layout');
  return index;
}
