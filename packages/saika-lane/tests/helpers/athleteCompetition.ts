// SPDX-License-Identifier: MIT
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { CompetitionTypeDefinition } from '@/main/modules/competition/domain/CompetitionTypeDefinition';
import { R3P60 } from '@/main/modules/competition/domain/competitionTypes';

/** Enters the first athlete-controlled series through normal shot progression. */
export function athleteCompetition(type: CompetitionTypeDefinition = R3P60): CompetitionState {
  let state = CompetitionState.create('comp-athlete', 'session-athlete', type.config)
    .startStage()
    .expireTimer()
    .advanceToNextStage()
    .startNextSeries();
  while (state.currentSeriesConfig.targetModeControl !== 'ATHLETE') state = state.recordShotInSeries();
  return state;
}

export function selectAthlete(state: CompetitionState, mode: 'SIGHTING' | 'MATCH'): CompetitionState {
  return state.selectAthleteTargetMode({
    competitionId: state.id,
    stageIndex: state.currentStageIndex,
    seriesIndex: state.currentSeriesIndex,
    mode,
  });
}
