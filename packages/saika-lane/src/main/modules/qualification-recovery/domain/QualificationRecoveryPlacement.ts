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

/** The interrupted series that a recovery run or settlement was decided for. */
export interface InterruptedSeriesBinding {
  readonly competitionId: string;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly expectedMatchProgramId: string;
  readonly expectedSeriesShotLimit: number;
  readonly expectedRecordedShots: number;
}

/** Words that name the recovery decision in the bound-series guard messages. */
export interface InterruptedSeriesWording {
  /** The decision the series limit must match, such as "recovery authorization". */
  readonly decision: string;
  /** What expects the recorded shots, such as "recovery". */
  readonly expectedBy: string;
  /** What is done to the competition, such as "adjudicated". */
  readonly action: string;
}

/** Throws unless the competition still sits at the interrupted series in the state the decision expects. */
export function assertBoundToInterruptedSeries(
  competition: CompetitionState,
  binding: InterruptedSeriesBinding,
  wording: InterruptedSeriesWording,
): void {
  if (competition.sessionId.length === 0) throw new Error('Qualification recovery competition has no session');
  if (competition.currentStageIndex !== binding.stageIndex || competition.currentSeriesIndex !== binding.seriesIndex) {
    throw new Error(`Competition ${binding.competitionId} has moved away from the interrupted series`);
  }
  if (competition.currentSeriesConfig.timedTargetProgramId !== binding.expectedMatchProgramId) {
    throw new Error(`Competition ${binding.competitionId} no longer uses ${binding.expectedMatchProgramId}`);
  }
  if (competition.currentSeriesConfig.maxShots !== binding.expectedSeriesShotLimit) {
    throw new Error(`The current series shot limit no longer matches the ${wording.decision}`);
  }
  if (competition.seriesShotCount !== binding.expectedRecordedShots) {
    throw new Error(
      `Competition has ${competition.seriesShotCount} recorded shot(s), but the ${wording.expectedBy} expects ${binding.expectedRecordedShots}`,
    );
  }
  if (competition.phase !== 'ACTIVE' && competition.phase !== 'SERIES_COMPLETE') {
    throw new Error(`Competition ${binding.competitionId} cannot be ${wording.action} from phase ${competition.phase}`);
  }
}
