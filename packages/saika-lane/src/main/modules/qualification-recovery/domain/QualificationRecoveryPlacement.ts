// SPDX-License-Identifier: MIT
import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { Shot } from '@/main/modules/session/domain/Shot';

/**
 * Places the current series in its session: the shot slots of the scored
 * Match series before it, counted from the last stage that starts a new
 * session, and its number among those series.
 */
export function resolveQualificationRecoveryPlacement(competition: CompetitionState): {
  priorShots: number;
  seriesNumber: number;
} {
  let sessionBoundaryStage = 0;
  for (let stageIndex = 0; stageIndex <= competition.currentStageIndex; stageIndex += 1) {
    if (competition.config.stages[stageIndex]?.requiresNewSession) sessionBoundaryStage = stageIndex;
  }
  let priorShots = 0;
  let priorSeries = 0;
  for (let stageIndex = sessionBoundaryStage; stageIndex <= competition.currentStageIndex; stageIndex += 1) {
    const stage = competition.config.stages[stageIndex]!;
    if (!stage.scored) continue;
    const end = stageIndex === competition.currentStageIndex ? competition.currentSeriesIndex : stage.series.length;
    for (let seriesIndex = 0; seriesIndex < end; seriesIndex += 1) {
      const series = stage.series[seriesIndex]!;
      if (series.maxShots === 0 || series.purpose === 'POSITION_CHANGE_AND_SIGHTING') continue;
      priorShots += series.maxShots;
      priorSeries += 1;
    }
  }
  return { priorShots, seriesNumber: priorSeries + 1 };
}

/** Orders recorded shots by shot number, then by firing time. */
export function compareRecordedShots(left: Shot, right: Shot): number {
  return left.shotNumber - right.shotNumber || left.timestamp.getTime() - right.timestamp.getTime();
}
