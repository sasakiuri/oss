import { createHash } from 'node:crypto';
import type { RankingShotEvidence } from '@/shared/competitionTypes';
import type { Result } from '../domain/Result';

/** Consumer-owned port. The result reader does not know which official workflow produced a replacement. */
export interface QualificationScoreOverlay {
  readonly id: string;
  readonly sourceDigest: string;
  readonly seriesIndex: number;
  readonly shotsX10: readonly number[];
  readonly rankingShots: readonly RankingShotEvidence[];
  readonly publicRemark: string;
  readonly issues: readonly string[];
}
export interface QualificationScoreOverlayHistory {
  readonly revision: string;
  readonly active: readonly QualificationScoreOverlay[];
}
export interface IQualificationScoreOverlaySource {
  forResult(result: Result): QualificationScoreOverlayHistory;
}
export const noQualificationScoreOverlays: IQualificationScoreOverlaySource = {
  forResult: () => ({ revision: '', active: [] }),
};

/** Binding includes identities and source evidence; confirmation status alone does not change the score. */
export function qualificationScoreSourceDigest(result: Result): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: result.id.value,
        eventId: result.eventId.value,
        participantId: result.participantId.value,
        relayNumber: result.relayNumber,
        competitionId: result.sourceCompetitionId,
        total: result.totalScore,
        series: result.seriesScores,
        shots: result.shots,
        evidence: result.rankingShots,
      }),
    )
    .digest('hex');
}

export function applyQualificationScoreOverlays(result: Result, history: QualificationScoreOverlayHistory) {
  const shotsX10 = result.shots.map((shot) => Math.round(shot * 10));
  const seriesScoresX10 = result.seriesScores.map((score) => Math.round(score * 10));
  const rankingShots = [...result.rankingShots];
  const issues: string[] = [];
  const ids: string[] = [];
  const remarks: string[] = [];
  const sourceDigest = qualificationScoreSourceDigest(result);
  const seriesSize = shotsX10.length / seriesScoresX10.length;
  let totalScoreX10 = Math.round(result.totalScore * 10);
  for (const overlay of history.active) {
    const duplicate = history.active.filter((other) => other.seriesIndex === overlay.seriesIndex).length > 1;
    if (
      overlay.issues.length ||
      overlay.sourceDigest !== sourceDigest ||
      duplicate ||
      !Number.isInteger(seriesSize) ||
      !Number.isInteger(overlay.seriesIndex) ||
      overlay.seriesIndex < 0 ||
      overlay.seriesIndex >= seriesScoresX10.length ||
      overlay.shotsX10.length !== seriesSize ||
      overlay.rankingShots.length !== seriesSize ||
      overlay.shotsX10.some((score) => !Number.isSafeInteger(score) || score < 0)
    ) {
      issues.push(`Score application ${overlay.id} requires reconciliation`, ...overlay.issues);
      continue;
    }
    const start = overlay.seriesIndex * seriesSize;
    const total = overlay.shotsX10.reduce((sum, score) => sum + score, 0);
    totalScoreX10 += total - seriesScoresX10[overlay.seriesIndex]!;
    seriesScoresX10[overlay.seriesIndex] = total;
    shotsX10.splice(start, seriesSize, ...overlay.shotsX10);
    // Preserve slots even when source evidence was incomplete.
    while (rankingShots.length < shotsX10.length) {
      const index = rankingShots.length;
      rankingShots.push({
        shotId: null,
        ringScore: Math.floor(shotsX10[index]! / 10),
        decimalScore: null,
        innerTen: null,
        seriesIndex: Math.floor(index / seriesSize),
      });
    }
    rankingShots.splice(start, seriesSize, ...overlay.rankingShots);
    ids.push(overlay.id);
    remarks.push(overlay.publicRemark);
  }
  return { totalScoreX10, seriesScoresX10, shotsX10, rankingShots, issues, ids, remarks };
}
