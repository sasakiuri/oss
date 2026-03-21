// SPDX-License-Identifier: MIT
import type {
  CompetitionIdInput,
  CompetitionStateDto,
  CompetitionTypeDto,
  StartCompetitionInput,
  StartCompetitionResponse,
} from '@/shared/ipc/contracts';

import { createCommandMethod, createServiceMethod, createVoidServiceMethod } from './createServiceMethod';

type StartCompetitionData = Extract<StartCompetitionResponse, { success: true }>['data'];

export const competitionService = {
  startCompetition: createServiceMethod<StartCompetitionInput, StartCompetitionData>((input) =>
    window.electronAPI.competition.startCompetition(input),
  ),

  startStage: createServiceMethod<CompetitionIdInput, { sessionId: string }>((input) =>
    window.electronAPI.competition.startStage(input),
  ),

  endStage: createCommandMethod<CompetitionIdInput>((input) => window.electronAPI.competition.endStage(input)),

  startNextSeries: createCommandMethod<CompetitionIdInput>((input) =>
    window.electronAPI.competition.startNextSeries(input),
  ),

  advanceStage: createCommandMethod<CompetitionIdInput>((input) => window.electronAPI.competition.advanceStage(input)),

  finishCompetition: createCommandMethod<CompetitionIdInput>((input) =>
    window.electronAPI.competition.finishCompetition(input),
  ),

  getCompetitionState: createServiceMethod<CompetitionIdInput, CompetitionStateDto>((input) =>
    window.electronAPI.competition.getCompetitionState(input),
  ),

  getCompetitionTypes: createVoidServiceMethod<CompetitionTypeDto[]>(() =>
    window.electronAPI.competition.getCompetitionTypes(),
  ),
};
