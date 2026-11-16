// SPDX-License-Identifier: MIT
import { createServiceMethod } from './createServiceMethod';

export const competitionService = {
  startCompetition: createServiceMethod((api) => api.competition.startCompetition),
  startStage: createServiceMethod((api) => api.competition.startStage),
  endStage: createServiceMethod((api) => api.competition.endStage),
  startNextSeries: createServiceMethod((api) => api.competition.startNextSeries),
  advanceStage: createServiceMethod((api) => api.competition.advanceStage),
  finishCompetition: createServiceMethod((api) => api.competition.finishCompetition),
  setAthleteTargetMode: createServiceMethod((api) => api.competition.setAthleteTargetMode),
  getCompetitionState: createServiceMethod((api) => api.competition.getCompetitionState),
  getCompetitionTypes: createServiceMethod((api) => api.competition.getCompetitionTypes),
};
